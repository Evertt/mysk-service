/**
 * The rules for an organization's team: who may change whose role, remove whom, and invite with
 * which role, and whether an invitation can still be accepted. better-auth's organization plugin
 * enforces most of these too; checking them here first gives clear messages (in the current
 * language), and covers the ones it doesn't (e.g. changing your own role).
 */

import { isManager, type MemberRole, memberRoles } from "./roles.ts";

export { type MemberRole, memberRoles } from "./roles.ts";

const isOwner = (roles: string[]) => roles.includes("owner");

export interface MemberChange {
	/** The signed-in user making the change, and their roles in the organization. */
	actor: { userId: string; roles: string[] };
	/** The member being changed or removed. */
	target: { userId: string; roles: string[] };
	/** How many owners the organization has, including the target. */
	owners: number;
}

/** Why `actor` may not give `target` the role `role`, or `null` if they may. */
export function roleChangeRefusal(
	{ actor, target, owners }: MemberChange,
	role: MemberRole,
): string | null {
	if (!isManager(actor.roles)) return m.settings_refusal_change_roles();
	if (isOwner(target.roles) && role !== "owner" && owners <= 1) {
		return m.settings_refusal_last_owner_role();
	}
	if (actor.userId === target.userId) return m.settings_refusal_own_role();
	if (isOwner(target.roles) && !isOwner(actor.roles)) return m.settings_refusal_owner_role();
	if (role === "owner" && !isOwner(actor.roles)) return m.settings_refusal_make_owner();
	return null;
}

/** Why `actor` may not remove `target` from the organization, or `null` if they may. */
export function removalRefusal({ actor, target, owners }: MemberChange): string | null {
	if (!isManager(actor.roles)) return m.settings_refusal_remove_members();
	if (isOwner(target.roles) && owners <= 1) return m.settings_refusal_last_owner_removal();
	if (actor.userId === target.userId) return m.settings_refusal_remove_yourself();
	if (isOwner(target.roles) && !isOwner(actor.roles)) return m.settings_refusal_remove_owner();
	return null;
}

/** The roles `actorRoles` may give someone they invite (or promote): owners only by owners. */
export const assignableRoles = (actorRoles: string[]): MemberRole[] =>
	isManager(actorRoles)
		? memberRoles.filter((role) => role !== "owner" || isOwner(actorRoles))
		: [];

/** Each role as in "invited … as an admin": with its article in English, without in Dutch. */
const invitedAs: Record<MemberRole, () => string> = {
	owner: m.auth_invite_as_owner,
	admin: m.auth_invite_as_admin,
	member: m.auth_invite_as_member,
	engineer: m.auth_invite_as_engineer,
};

/**
 * The roles someone is invited with, to follow "as", e.g. "an admin" or "an admin and a field
 * engineer"; an unknown role as it's stored.
 */
export function invitedAsText(roles: readonly string[]) {
	const texts = roles.map((role) =>
		Object.hasOwn(invitedAs, role) ? invitedAs[role as MemberRole]() : role,
	);
	if (!texts.length) return "";
	return texts.reduce((first, second) => m.auth_invite_roles_and({ first, second }));
}

/** How long an invitation can be accepted, in seconds. */
export const INVITATION_EXPIRES_IN = 7 * 24 * 60 * 60;

/** better-auth's invitation statuses; an invitation still `pending` after its date has expired. */
export type InvitationState = "pending" | "expired" | "accepted" | "canceled" | "rejected";

/** Where an invitation stands at `now`: only a `pending` one can be accepted. */
export function invitationState(
	invitation: { status: string; expiresAt: Date },
	now = new Date(),
): InvitationState {
	switch (invitation.status) {
		case "pending":
			return invitation.expiresAt > now ? "pending" : "expired";
		case "accepted":
		case "canceled":
		case "rejected":
			return invitation.status;
		default:
			// An unknown status can't be accepted.
			return "canceled";
	}
}
