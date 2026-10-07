/**
 * The roles a member can have in an organization: better-auth's owner, admin and member, plus
 * field engineers. The one list of them, for the auth config, the session checks and the UI. Kept
 * out of `$lib/server` so client code (role pickers, badges) can import it. Their names and what
 * they're for are translated labels: `label("memberRole", role)` and
 * `label("memberRoleDescription", role)` from `#lib/i18n/labels.ts`.
 */

export const memberRoles = ["owner", "admin", "member", "engineer"] as const;
export type MemberRole = (typeof memberRoles)[number];

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
