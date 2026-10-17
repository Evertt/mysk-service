/**
 * The roles a member can have in an organization: better-auth's owner, admin and member, plus
 * field engineers and customer contacts. The one list of them, for the auth config, the session
 * checks and the UI. Kept out of `$lib/server` so client code (role pickers, badges) can import
 * it. Their names and what they're for are translated labels: `label("memberRole", role)` and
 * `label("memberRoleDescription", role)` from `#lib/i18n/labels.ts`.
 */

export const memberRoles = ["owner", "admin", "member", "engineer", "customer"] as const;
export type MemberRole = (typeof memberRoles)[number];

/**
 * The roles of the organization's own people, which the members page invites with and changes:
 * all but `customer`. A customer contact is invited from their customer's page (its portal
 * access), linked to that customer, and never becomes one of the team by a change of role.
 */
export const teamRoles = ["owner", "admin", "member", "engineer"] as const satisfies MemberRole[];
export type TeamRole = (typeof teamRoles)[number];

/** The roles that work in the office app (everything but the engineer portal). */
export const officeRoles = ["owner", "admin", "member"] as const satisfies MemberRole[];

/** A member's roles: better-auth stores them comma-separated, e.g. `owner` or `admin,member`. */
export const parseRoles = (role: string) =>
	role
		.split(",")
		.map((r) => r.trim())
		.filter(Boolean);

/** Roles that may manage the organization's members and invitations, and its settings. */
export const managerRoles: MemberRole[] = ["owner", "admin"];

/** Whether a member with these roles is a manager (an owner or an admin). */
export const isManager = (roles: readonly string[]) =>
	roles.some((role) => (managerRoles as string[]).includes(role));

/**
 * Whether a member with these roles (in their current organization) is a field engineer only:
 * they use the engineer portal at /my, not the office app. Someone who also has an office role
 * works in the office.
 */
export const isFieldEngineer = (roles: readonly string[]) =>
	roles.includes("engineer") &&
	!roles.some((role) => (officeRoles as readonly string[]).includes(role));

/**
 * Whether a member with these roles is a customer contact only: they use the customer portal at
 * /portal (their customer's orders, units and sites), never the office app or the engineer portal.
 * Someone who also has a role of the team works as that (being both is out of scope for now).
 */
export const isCustomerContact = (roles: readonly string[]) =>
	roles.includes("customer") &&
	!roles.some((role) => (teamRoles as readonly string[]).includes(role));
