import { form, getRequestEvent, query } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { isAPIError } from "better-auth/api";
import { and, asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import * as v from "valibot";

import { label } from "#lib/i18n/labels.js";
import {
	assignableRoles,
	invitationState,
	type MemberChange,
	type MemberRole,
	memberRoles,
	removalRefusal,
	roleChangeRefusal,
} from "#lib/members.js";
import { m } from "#lib/paraglide/messages.js";
import { isManager, parseRoles } from "#lib/roles.js";
import { recordActivityAfter } from "#lib/server/activity.js";
import { auth } from "#lib/server/auth.js";
import { db } from "#lib/server/db/index.js";
import { invitation, member, user } from "#lib/server/db/schema.js";
import { inTenant, requireManager, requireMember } from "#lib/server/session.js";

/**
 * The organization's members, and for owners and admins its pending invitations, with what the
 * signed-in user may do to each. Members see the list read-only, as on the settings page.
 */
export const getMembers = query(async () => {
	const tenant = requireMember();
	const canManage = isManager(tenant.roles);
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
			.where(inTenant(member))
			.orderBy(asc(user.name)),
		canManage
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
					.where(and(inTenant(invitation), eq(invitation.status, "pending")))
					.orderBy(asc(invitation.createdAt))
			: [],
	]);

	const owners = members.filter((m) => parseRoles(m.role).includes("owner")).length;
	const actor = { userId: tenant.user.id, roles: tenant.roles };
	return {
		name: tenant.name,
		canManage,
		/** The roles the signed-in user can invite people with. */
		inviteRoles: assignableRoles(tenant.roles),
		members: members.map((m) => {
			const roles = parseRoles(m.role);
			const change: MemberChange = { actor, target: { userId: m.userId, roles }, owners };
			// The member's role, and the ones the signed-in user may change it to.
			const roleOptions = memberRoles.filter(
				(role) => roles.includes(role) || roleChangeRefusal(change, role) === null,
			);
			return {
				...m,
				roles,
				isYou: m.userId === tenant.user.id,
				roleOptions: canManage && roleOptions.length > 1 ? roleOptions : [],
				canRemove: canManage && removalRefusal(change) === null,
			};
		}),
		invitations: invitations.map((i) => ({
			...i,
			expired: invitationState(i) === "expired",
		})),
	};
});

/** What the rules in `#lib/members.ts` need to know about changing one of the tenant's members. */
async function memberChange(memberId: string): Promise<MemberChange> {
	const tenant = requireMember();
	const members = await db
		.select({ id: member.id, userId: member.userId, role: member.role })
		.from(member)
		.where(inTenant(member));
	const target = members.find((m) => m.id === memberId);
	if (!target) error(404, m.settings_member_not_found());
	return {
		actor: { userId: tenant.user.id, roles: tenant.roles },
		target: { userId: target.userId, roles: parseRoles(target.role) },
		owners: members.filter((m) => parseRoles(m.role).includes("owner")).length,
	};
}

/** One of the tenant's members as the activity log shows them (by name), with their role. */
async function memberSubject(memberId: string) {
	const [found] = await db
		.select({ name: user.name, role: member.role })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(and(eq(member.id, memberId), inTenant(member)));
	if (!found) error(404, m.settings_member_not_found());
	return { subject: { type: "member", id: memberId, label: found.name }, role: found.role };
}

/** How an invitation shows in the activity log: by the email address it's for. */
const invitationSubject = (found: { id: string; email: string }) => ({
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
	const found = await db.query.invitation.findFirst({
		where: and(eq(invitation.id, id), inTenant(invitation), eq(invitation.status, "pending")),
	});
	if (!found) error(404, m.settings_invitation_not_found());
	return found;
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
		if (isAPIError(e) && e.statusCode < 500) invalid(e.message || m.settings_not_possible());
		throw e;
	}
}

export const changeRole = form(
	v.object({ memberId: v.string(), role: v.picklist(memberRoles) }),
	async ({ memberId, role }) => {
		const { organizationId } = requireManager();
		const refusal = roleChangeRefusal(await memberChange(memberId), role);
		if (refusal) invalid(refusal);
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

export const removeMember = form(v.object({ id: v.string() }), async ({ id }) => {
	const { organizationId } = requireManager();
	const refusal = removalRefusal(await memberChange(id));
	if (refusal) invalid(refusal);
	const { subject } = await memberSubject(id);
	// The removed user's next request finds them in another of their organizations, or not a member
	// of any (see `loadTenant`).
	await asUser((headers) =>
		auth.api.removeMember({ body: { memberIdOrEmail: id, organizationId }, headers }),
	);
	await recordActivityAfter({ action: "removed", subject });
	void getMembers().refresh();
});

export const invite = form(
	v.object({
		email: v.config(
			v.pipe(
				v.string(),
				v.trim(),
				v.nonEmpty(m.settings_email_required),
				v.email(m.settings_email_invalid),
				v.toLowerCase(),
			),
			{ abortPipeEarly: true },
		),
		role: v.picklist(memberRoles, m.settings_role_required),
	}),
	async ({ email, role }, issue) => {
		const tenant = requireManager();
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
export const resendInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	const tenant = requireManager();
	const found = await findInvitation(id);
	const role = parseRoles(found.role ?? "member") as MemberRole[];
	if (role.includes("owner") && !tenant.roles.includes("owner")) {
		invalid(m.settings_only_owners_invite_owners());
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

export const cancelInvitation = form(v.object({ id: v.string() }), async ({ id }) => {
	requireManager();
	const found = await findInvitation(id);
	await asUser((headers) => auth.api.cancelInvitation({ body: { invitationId: id }, headers }));
	await recordActivityAfter({ action: "cancelled", subject: invitationSubject(found) });
	void getMembers().refresh();
});
