import { getRequestEvent } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { and, asc, eq, not, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import {
	assignableRoles,
	invitationState,
	isManager,
	type MemberChange,
	type MemberRole,
	parseRoles,
	removalRefusal,
	roleChangeRefusal,
	teamRoles,
} from "#lib/auth/index.ts";
import { label } from "#lib/i18n/index.ts";
import { email } from "#lib/schema.ts";
import { recordActivityAfter, type Subject } from "#lib/server/activity/index.ts";
import { auth, currentTenant, inTenant, idInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { invitation, member, user } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";
import { forManagers, forMembers } from "#lib/server/remote-functions.ts";

/**
 * Whether a member's or an invitation's roles (stored comma-separated, `owner,engineer`) include
 * `customer`: customers' contacts are on their customer's page (its portal access), not here.
 */
const isCustomerRole = (role: typeof member.role | typeof invitation.role) =>
	sql`(',' || replace(coalesce(${role}, ''), ' ', '') || ',') like '%,customer,%'`;

/**
 * The organization's team, and for owners and admins its pending invitations, with what the
 * signed-in user may do to each. Members see the list read-only, as on the settings page.
 * Customers' contacts aren't part of it (see `isCustomerRole`).
 */
export const getMembers = forMembers.query(async () => {
	const tenant = currentTenant();
	const manager = isManager(tenant.roles);
	const inviter = alias(user, "inviter");
	const [members, invitations] = await Promise.all([
		db
			.select({
				id: member.id,
				userId: member.userId,
				name: user.name,
				email: user.email,
				role: member.role,
				joinedAt: member.createdAt,
			})
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(inTenant(member), not(isCustomerRole(member.role))))
			.orderBy(asc(user.name)),
		manager
			? db
					.select({
						id: invitation.id,
						email: invitation.email,
						role: invitation.role,
						status: invitation.status,
						expiresAt: invitation.expiresAt,
						invitedAt: invitation.createdAt,
						invitedBy: inviter.name,
					})
					.from(invitation)
					.leftJoin(inviter, eq(invitation.inviterId, inviter.id))
					.where(
						and(
							inTenant(invitation),
							eq(invitation.status, "pending"),
							not(isCustomerRole(invitation.role)),
						),
					)
					.orderBy(asc(invitation.createdAt))
			: [],
	]);

	const owners = members.filter((m) => parseRoles(m.role).includes("owner")).length;
	const actor = { userId: tenant.user.id, roles: tenant.roles };
	return {
		name: tenant.name,
		/** The roles the signed-in user can invite people with. */
		inviteRoles: assignableRoles(tenant.roles),
		members: members.map((m) => {
			const roles = parseRoles(m.role);
			const change: MemberChange = { actor, target: { userId: m.userId, roles }, owners };
			// The member's role, and the ones the signed-in user may change it to.
			const roleOptions = teamRoles.filter(
				(role) => roles.includes(role) || roleChangeRefusal(change, role) === null,
			);
			return {
				...m,
				roles,
				isYou: m.userId === tenant.user.id,
				roleOptions: manager && roleOptions.length > 1 ? roleOptions : [],
				canRemove: manager && removalRefusal(change) === null,
			};
		}),
		invitations: invitations.map((i) => ({
			...i,
			expired: invitationState(i) === "expired",
		})),
	};
});

/** What the rules in `#lib/auth/members.ts` need to know about changing one of the tenant's members. */
async function memberChange(memberId: string): Promise<MemberChange> {
	const tenant = currentTenant();
	const members = await db
		.select({ id: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(inTenant(member));
	// A customer's contact is changed on their customer's page only.
	const target = orNotFound(
		members.find((one) => one.id === memberId && !parseRoles(one.role).includes("customer")),
		m.settings_member_not_found(),
	);
	return {
		actor: { userId: tenant.user.id, roles: tenant.roles },
		target: { userId: target.userId, roles: parseRoles(target.role) },
		owners: members.filter((m) => parseRoles(m.role).includes("owner")).length,
	};
}

/** One of the tenant's members as the activity log shows them (by name), with their role. */
async function memberSubject(memberId: string) {
	const found = orNotFound(
		await db
			.select({ name: user.name, role: member.role })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(idInTenant(member, memberId)),
		m.settings_member_not_found(),
	);
	const subject: Subject = { type: "member", id: memberId, label: found.name };
	return { subject, role: found.role };
}

/** How an invitation shows in the activity log: by the email address it's for. */
const invitationSubject = (found: { id: string; email: string }): Subject => ({
	type: "invitation",
	id: found.id,
	label: found.email,
});

/**
 * The roles an invitation is for, as a note in the activity log: stored as text, in the language
 * of whoever sent it.
 */
const asRoles = (roles: readonly MemberRole[]) =>
	m.settings_invitation_note({ roles: roles.map((role) => label("memberRole", role)).join(", ") });

/** One of the tenant's pending invitations, or a 404. Ids are global, so look up in the tenant. */
async function findInvitation(id: string) {
	return orNotFound(
		await db.query.invitation.findFirst({
			where: and(
				eq(invitation.id, id),
				inTenant(invitation),
				eq(invitation.status, "pending"),
				not(isCustomerRole(invitation.role)),
			),
		}),
		m.settings_invitation_not_found(),
	);
}

/**
 * Runs one of better-auth's organization endpoints as the signed-in user. It checks permissions
 * again; what it refuses is shown in the form.
 */
async function asUser<T>(call: (headers: Headers) => Promise<T>) {
	try {
		return await call(getRequestEvent().request.headers);
	} catch (e) {
		// better-auth's own messages are in English.
		if (isAPIError(e) && e.statusCode < 500)
			throw new Refused(e.message || m.settings_not_possible());
		throw e;
	}
}

export const changeRole = forManagers.form(
	v.object({ memberId: v.string(), role: v.picklist(teamRoles) }),
	async ({ memberId, role }) => {
		const { organizationId } = currentTenant();
		const refusal = roleChangeRefusal(await memberChange(memberId), role);
		if (refusal) throw new Refused(refusal);
		const { subject, role: before } = await memberSubject(memberId);
		await asUser((headers) =>
			auth.api.updateMemberRole({ body: { memberId, role, organizationId }, headers }),
		);
		await recordActivityAfter({
			action: "updated",
			subject,
			before: { role: before },
			after: { role },
		});
		void getMembers().refresh();
	},
);

export const removeMember = forManagers.form(v.object({ id: v.string() }), async ({ id }) => {
	const { organizationId } = currentTenant();
	const refusal = removalRefusal(await memberChange(id));
	if (refusal) throw new Refused(refusal);
	const { subject } = await memberSubject(id);
	// The removed user's next request finds them in another of their organizations, or not a member
	// of any (see `loadTenant`).
	await asUser((headers) =>
		auth.api.removeMember({ body: { memberIdOrEmail: id, organizationId }, headers }),
	);
	await recordActivityAfter({ action: "removed", subject });
	void getMembers().refresh();
});

export const invite = forManagers.form(
	v.object({
		email: email(m.settings_email_required, m.settings_email_invalid),
		role: v.picklist(teamRoles, m.settings_role_required),
	}),
	async ({ email, role }, issue) => {
		const tenant = currentTenant();
		if (!assignableRoles(tenant.roles).includes(role)) {
			invalid(issue.role(m.settings_only_owners_invite_owners()));
		}
		const [existing] = await db
			.select({ id: member.id })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(and(inTenant(member), eq(user.email, email)));
		if (existing) invalid(issue.email(m.settings_already_member({ email })));
		const pending = await db.query.invitation.findMany({
			columns: { status: true, expiresAt: true },
			where: and(inTenant(invitation), eq(invitation.email, email)),
		});
		if (pending.some((i) => invitationState(i) === "pending")) {
			invalid(issue.email(m.settings_already_invited({ email })));
		}
		const sent = await asUser((headers) =>
			auth.api.createInvitation({
				body: { email, role, organizationId: tenant.organizationId },
				headers,
			}),
		);
		await recordActivityAfter({
			action: "sent",
			subject: invitationSubject({ id: sent.id, email }),
			note: asRoles([role]),
		});
		void getMembers().refresh();
		return { email };
	},
);

/** Sends an invitation again, with a new expiry date. */
export const resendInvitation = forManagers.form(v.object({ id: v.string() }), async ({ id }) => {
	const tenant = currentTenant();
	const found = await findInvitation(id);
	const role = parseRoles(found.role ?? "member") as MemberRole[];
	if (role.includes("owner") && !tenant.roles.includes("owner")) {
		throw new Refused(m.settings_only_owners_invite_owners());
	}
	await asUser(async (headers) => {
		const body = { email: found.email, role, organizationId: tenant.organizationId };
		if (invitationState(found) === "pending") {
			// better-auth extends it and sends it again.
			return auth.api.createInvitation({ body: { ...body, resend: true }, headers });
		}
		// An expired one can't be extended: replace it.
		await auth.api.cancelInvitation({ body: { invitationId: id }, headers });
		return auth.api.createInvitation({ body, headers });
	});
	await recordActivityAfter({
		action: "resent",
		subject: invitationSubject(found),
		note: asRoles(role),
	});
	void getMembers().refresh();
	return { email: found.email };
});

export const cancelInvitation = forManagers.form(v.object({ id: v.string() }), async ({ id }) => {
	const found = await findInvitation(id);
	await asUser((headers) => auth.api.cancelInvitation({ body: { invitationId: id }, headers }));
	await recordActivityAfter({ action: "cancelled", subject: invitationSubject(found) });
	void getMembers().refresh();
});
