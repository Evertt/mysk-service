/**
 * The demo organizations and accounts the seed creates, see "Demo login" in README.md. Shared by
 * the seed and the end-to-end tests, which sign in with them. The demo is of Dutch field-service
 * companies, so the names are Dutch: two Fieldworks installers, and SHLTR, the client whose
 * business the third shows (`docs/plans/shltr-domain.md`).
 */

/** The password of every demo user. Local demo data only, documented in README.md. */
export const DEMO_PASSWORD = "fieldworks-demo";

/** The demo organizations (tenants). */
export const demoOrganizations = {
	north: { id: "org-north", name: "Fieldworks Noord" },
	south: { id: "org-south", name: "Fieldworks Zuid" },
	shltr: { id: "org-shltr", name: "SHLTR" },
} as const;

/**
 * Who's in which organization, with which role. SHLTR's people are in SHLTR only, so what the
 * Fieldworks tenants' tests expect of their members stays true.
 */
export const demoUsers = [
	{
		name: "Anouk de Vries",
		email: "admin@fieldworks.example",
		memberships: [
			{ organizationId: "org-north", role: "owner" },
			{ organizationId: "org-south", role: "owner" },
		],
	},
	{
		name: "Pieter Jansen",
		email: "planner@fieldworks.example",
		memberships: [{ organizationId: "org-north", role: "member" }],
	},
	{
		name: "Erik Visser",
		email: "engineer@fieldworks.example",
		memberships: [{ organizationId: "org-north", role: "engineer" }],
		/** A field engineer: linked to the organization's first engineer, with work today and soon. */
		engineerIn: "org-north",
	},
	{
		name: "Marloes Hendriks",
		email: "owner@shltr.example",
		memberships: [{ organizationId: "org-shltr", role: "owner" }],
	},
	{
		// The mockup's signed-in user, a planner ("Weggemans01" in its log).
		name: "Jan Weggemans",
		email: "jan@shltr.example",
		memberships: [{ organizationId: "org-shltr", role: "member" }],
	},
	{
		// The mockup's engineer ("lev"), SHLTR's first.
		name: "Lev Hoekstra",
		email: "lev@shltr.example",
		memberships: [{ organizationId: "org-shltr", role: "engineer" }],
		engineerIn: "org-shltr",
	},
];
