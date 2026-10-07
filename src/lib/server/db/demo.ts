/**
 * The demo accounts the seed creates, see "Demo login" in README.md. Shared by the seed and the
 * end-to-end tests, which sign in with them.
 */

/** The password of every demo user. Local demo data only, documented in README.md. */
export const DEMO_PASSWORD = "fieldworks-demo";

/** Who's in which organization, with which role. */
export const demoUsers = [
	{
		name: "Avery Admin",
		email: "admin@fieldworks.example",
		memberships: [
			{ organizationId: "org-north", role: "owner" },
			{ organizationId: "org-south", role: "owner" },
		],
	},
	{
		name: "Pat Planner",
		email: "planner@fieldworks.example",
		memberships: [{ organizationId: "org-north", role: "member" }],
	},
	{
		name: "Eli Engineer",
		email: "engineer@fieldworks.example",
		memberships: [{ organizationId: "org-north", role: "engineer" }],
		/** A field engineer: linked to the organization's first engineer, with work today and soon. */
		engineerIn: "org-north",
	},
];
