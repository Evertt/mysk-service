/**
 * The rules for an organization's team: who may change whose role, remove whom, and invite with
 * which role, and whether an invitation can still be accepted. better-auth's organization plugin
 * enforces most of these too; checking them here first gives clear messages, and covers the ones
 * it doesn't (e.g. changing your own role).
 */

/** better-auth's built-in member roles, most powerful first. */
export const memberRoles = ["owner", "admin", "member"] as const;

export type MemberRole = (typeof memberRoles)[number];

export const roleLabels: Record<MemberRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

export const roleDescriptions: Record<MemberRole, string> = {
	owner: "Everything, including managing owners.",
	admin: "Manages settings, members and invitations.",
	member: "Works with the organization's records.",
};

/** A member's roles: better-auth stores them comma-separated, e.g. `owner` or `admin,member`. */
export const parseRoles = (role: string) =>
	role
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

/** Roles that may manage the organization's members and invitations. */
export const managerRoles: MemberRole[] = ["owner", "admin"];

export const canManageMembers = (roles: string[]) =>
	roles.some((role) => (managerRoles as string[]).includes(role));

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
	if (!canManageMembers(actor.roles)) return "Only owners and admins can change roles.";
	if (isOwner(target.roles) && role !== "owner" && owners <= 1) {
		return "The organization needs at least one owner. Make someone else an owner first.";
	}
	if (actor.userId === target.userId) return "You can't change your own role.";
	if (isOwner(target.roles) && !isOwner(actor.roles)) {
		return "Only owners can change an owner's role.";
	}
	if (role === "owner" && !isOwner(actor.roles)) return "Only owners can make someone an owner.";
	return null;
}

/** Why `actor` may not remove `target` from the organization, or `null` if they may. */
export function removalRefusal({ actor, target, owners }: MemberChange): string | null {
	if (!canManageMembers(actor.roles)) return "Only owners and admins can remove members.";
	if (isOwner(target.roles) && owners <= 1) {
		return "The organization needs at least one owner, so its last owner can't be removed.";
	}
	if (actor.userId === target.userId) return "You can't remove yourself.";
	if (isOwner(target.roles) && !isOwner(actor.roles)) return "Only owners can remove an owner.";
	return null;
}

/** The roles `actorRoles` may give someone they invite (or promote): owners only by owners. */
export const assignableRoles = (actorRoles: string[]): MemberRole[] =>
	canManageMembers(actorRoles)
		? memberRoles.filter((role) => role !== "owner" || isOwner(actorRoles))
		: [];

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
