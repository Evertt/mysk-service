/**
 * A customer's portal access, on the customer's page: the contacts who sign in to the customer
 * portal for them, all of the customer's sites or some. Every office member sees who has access;
 * owners and admins invite a contact by email (better-auth's invitation with the role `customer`,
 * which links their account to the contact when they accept it, see `/invite/[id]`) and revoke
 * access (their membership goes, or the invitation is cancelled). Logged on the customer.
 */
import { getRequestEvent } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { and, asc, eq, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { invitationState, isManager } from "#lib/auth/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { auth, currentTenant, idInTenant, idsInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	invitation,
	member,
	portalContact,
	portalContactSite,
	user,
} from "#lib/server/db/schema.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

/** The tenant's customer for which `where` holds, or a 404. */
async function findCustomer(where: SQL) {
	const [found] = await db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.where(and(where, inTenant(customer)));
	if (!found) error(404, m.customers_not_found());
	return found;
}

/** Where a contact's access stands: invited (or the invitation expired), or signed up. */
export type PortalContactState = "invited" | "expired" | "active";

/**
 * The customer `code`'s portal contacts, newest first, with the sites each sees (`null` for all),
 * and whether the signed-in user may invite and revoke (an owner or admin).
 */
export const getPortalAccess = forMembers.query(v.string(), async (code) => {
	const owner = await findCustomer(eq(customer.code, code));
	const [contacts, sites] = await Promise.all([
		db.query.portalContact.findMany({
			columns: { id: true, email: true, allSites: true, invitationId: true, createdAt: true },
			where: and(eq(portalContact.customerId, owner.id), inTenant(portalContact)),
			with: {
				user: { columns: { name: true } },
				sites: { columns: { siteId: true } },
			},
			orderBy: asc(portalContact.createdAt),
		}),
		db
			.select({ id: customerSite.id, name: customerSite.name })
			.from(customerSite)
			.where(and(eq(customerSite.customerId, owner.id), inTenant(customerSite)))
			.orderBy(asc(customerSite.name)),
	]);
	const invitationIds = contacts.flatMap((contact) => contact.invitationId ?? []);
	const invitations = invitationIds.length
		? await db.query.invitation.findMany({
				columns: { id: true, status: true, expiresAt: true },
				where: and(inList(invitation.id, invitationIds), inTenant(invitation)),
			})
		: [];
	const invitationOf = new Map(invitations.map((found) => [found.id, found]));
	const siteName = new Map(sites.map((site) => [site.id, site.name]));
	return {
		customer: owner,
		canManage: isManager(currentTenant().roles),
		sites,
		contacts: contacts.map((contact) => {
			const sent = contact.invitationId ? invitationOf.get(contact.invitationId) : undefined;
			const state: PortalContactState = contact.user
				? "active"
				: sent && invitationState(sent) === "pending"
					? "invited"
					: "expired";
			return {
				id: contact.id,
				email: contact.email,
				name: contact.user?.name ?? null,
				state,
				invitedAt: contact.createdAt,
				sites: contact.allSites
					? null
					: contact.sites.flatMap(({ siteId }) => siteName.get(siteId) ?? []),
			};
		}),
	};
});

/**
 * Runs one of better-auth's organization endpoints as the signed-in user. It checks permissions
 * again; what it refuses is shown in the form.
 */
async function asUser<T>(call: (headers: Headers) => Promise<T>) {
	try {
		return await call(getRequestEvent().request.headers);
	} catch (e) {
		// better-auth's own messages are in English.
		if (isAPIError(e) && e.statusCode < 500) invalid(e.message || m.customers_portal_failed());
		throw e;
	}
}

const emailSchema = v.config(
	v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(m.customers_portal_email_required),
		v.email(m.customers_portal_email_invalid),
		v.toLowerCase(),
	),
	{ abortPipeEarly: true },
);

/** How the customer shows in the log, as the parent of its portal access. */
const customerParent = (found: { id: number; code: string }) => ({
	type: "customer",
	id: found.id,
	label: found.code,
});

/**
 * Invites a contact of the customer to its portal by email, for all of its sites or only
 * `siteIds` (none ticked is all). Refuses an address that's a member already (a contact with access
 * is one) or is invited already; a contact whose invitation expired is invited again.
 */
export const invitePortalContact = forManagers.form(
	v.object({
		customerId: id(),
		email: emailSchema,
		/** The customer's sites they'll see; none for all of them. */
		siteIds: v.optional(v.array(id()), []),
	}),
	async (input, issue) => {
		const { organizationId } = currentTenant();
		const owner = await findCustomer(idInTenant(customer, input.customerId));
		const siteIds = [...new Set(input.siteIds)];
		if (siteIds.length) {
			const own = await db
				.select({ id: customerSite.id })
				.from(customerSite)
				.where(and(idsInTenant(customerSite, siteIds), eq(customerSite.customerId, owner.id)));
			if (own.length !== siteIds.length) invalid(issue.siteIds(m.customers_portal_unknown_site()));
		}
		const { email } = input;
		const [existing] = await db
			.select({ id: member.id })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(inTenant(member), eq(user.email, email)));
		if (existing) invalid(issue.email(m.customers_portal_already_member({ email })));
		const pending = await db.query.invitation.findMany({
			columns: { status: true, expiresAt: true },
			where: and(inTenant(invitation), eq(invitation.email, email)),
		});
		if (pending.some((found) => invitationState(found) === "pending")) {
			invalid(issue.email(m.customers_portal_already_invited({ email })));
		}

		// better-auth's invitation (and its mail) first: it's outside the app's transactions.
		const sent = await asUser((headers) =>
			auth.api.createInvitation({ body: { email, role: "customer", organizationId }, headers }),
		);
		await db.transaction(async (tx) => {
			// A contact of this address whose invitation expired (or was cancelled) is invited anew.
			await tx
				.delete(portalContact)
				.where(and(inTenant(portalContact), eq(portalContact.email, email)));
			const [created] = await tx
				.insert(portalContact)
				.values({
					organizationId,
					customerId: owner.id,
					email,
					invitationId: sent.id,
					allSites: !siteIds.length,
				})
				.returning({ id: portalContact.id });
			await insertRows(
				tx,
				portalContactSite,
				siteIds.map((siteId) => ({
					organizationId,
					contactId: created.id,
					customerId: owner.id,
					siteId,
				})),
			);
			await recordActivity(tx, {
				action: "sent",
				subject: { type: "invitation", id: sent.id, label: email },
				parent: customerParent(owner),
				note: m.customers_portal_invitation_note(),
			});
		});
		void getPortalAccess(owner.code).refresh();
		return { email };
	},
);

/**
 * Takes a contact's portal access away: their membership of the organization goes (or their
 * invitation is cancelled, while it's pending), and the contact with it.
 */
export const revokePortalContact = forManagers.form(v.object({ id: id() }), async (input) => {
	const { organizationId } = currentTenant();
	const found = await db.query.portalContact.findFirst({
		columns: { id: true, email: true, userId: true, invitationId: true },
		where: idInTenant(portalContact, input.id),
		with: { customer: { columns: { id: true, code: true } } },
	});
	if (!found) error(404, m.customers_portal_contact_not_found());
	if (found.userId) {
		const [membership] = await db
			.select({ id: member.id })
			.from(member)
			.where(and(inTenant(member), eq(member.userId, found.userId)));
		if (membership) {
			await asUser((headers) =>
				auth.api.removeMember({
					body: { memberIdOrEmail: membership.id, organizationId },
					headers,
				}),
			);
		}
	} else if (found.invitationId) {
		const sent = await db.query.invitation.findFirst({
			columns: { id: true, status: true },
			where: and(eq(invitation.id, found.invitationId), inTenant(invitation)),
		});
		if (sent?.status === "pending") {
			await asUser((headers) =>
				auth.api.cancelInvitation({ body: { invitationId: sent.id }, headers }),
			);
		}
	}
	await db.transaction(async (tx) => {
		await tx.delete(portalContact).where(idInTenant(portalContact, found.id));
		await recordActivity(tx, {
			action: "revoked",
			subject: { type: "portal_contact", id: found.id, label: found.email },
			parent: customerParent(found.customer),
		});
	});
	void getPortalAccess(found.customer.code).refresh();
});
