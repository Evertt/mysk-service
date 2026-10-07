/**
 * The roles a member can have in an organization: better-auth's owner, admin and member, plus
 * field engineers. The one list of them, for the auth config, the session checks and the UI. Kept
 * out of `$lib/server` so client code (role pickers, badges) can import it.
 */

export const memberRoles = ["owner", "admin", "member", "engineer"] as const;
export type MemberRole = (typeof memberRoles)[number];

export const roleLabels: Record<MemberRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
	engineer: "Field engineer",
};

/** What each role is for, e.g. to explain a choice of role. */
export const roleDescriptions: Record<MemberRole, string> = {
	owner: "Everything, including managing owners.",
	admin: "Manages settings, members and invitations.",
	member: "Works in the office: orders, planning and records.",
	engineer: "Works in the field: only their own orders, in the engineer portal.",
};

/** The roles that work in the office app (everything but the engineer portal). */
export const officeRoles = ["owner", "admin", "member"] as const satisfies MemberRole[];

/**
 * Whether a member with these roles (in their current organization) is a field engineer only:
 * they use the engineer portal at /my, not the office app. Someone who also has an office role
 * works in the office.
 */
export const isFieldEngineer = (roles: readonly string[]) =>
	roles.includes("engineer") &&
	!roles.some((role) => (officeRoles as readonly string[]).includes(role));
