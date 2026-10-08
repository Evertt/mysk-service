/**
 * The demo organizations and accounts the seed creates, see "Demo login" in README.md. Shared by
 * the seed and the end-to-end tests, which sign in with them. The demo is a Dutch field-service
 * company's, so the names are Dutch.
 */

/** The password of every demo user. Local demo data only, documented in README.md. */
export const DEMO_PASSWORD = "fieldworks-demo";

/** The demo organizations (tenants). */
export const demoOrganizations = {
	north: { id: "org-north", name: "Fieldworks Noord" },
	south: { id: "org-south", name: "Fieldworks Zuid" },
} as const;

/** Who's in which organization, with which role. */
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
];
