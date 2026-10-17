/**
 * The demo organizations and accounts the seed creates, see "Demo login" in README.md. Shared by
 * the seed and the end-to-end tests, which sign in with them. The demo is of Dutch field-service
 * companies, so the names are Dutch: two Fieldworks installers, and SHLTR, the client whose
 * business the third shows (`docs/plans/shltr-domain.md`).
 */
import type { DemoCustomerLink } from "./seed/portal.ts";

/** The password of every demo user. Local demo data only, documented in README.md. */
export const DEMO_PASSWORD = "fieldworks-demo";

/** The demo organizations (tenants). */
export const demoOrganizations = {
	north: { id: "org-north", name: "Fieldworks Noord" },
	south: { id: "org-south", name: "Fieldworks Zuid" },
	shltr: { id: "org-shltr", name: "SHLTR" },
} as const;

/** A demo account: its memberships, and what it's linked to there (an engineer, a customer). */
interface DemoUser {
	name: string;
	email: string;
	memberships: { organizationId: string; role: string }[];
	/** A field engineer: linked to the organization's first engineer, with work planned. */
	engineerIn?: string;
	/** A customer's contact: linked to that customer, with the breakdowns they reported. */
	customerIn?: DemoCustomerLink;
}

/**
 * Who's in which organization, with which role. SHLTR's people are in SHLTR only, so what the
 * Fieldworks tenants' tests expect of their members stays true.
 */
export const demoUsers: DemoUser[] = [
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
	// Customers' contacts, in the customer portal at /portal (see `seed/portal.ts`).
	{
		// Riedel's facilities contact, for all of Riedel's sites.
		name: "Marieke Verhoeven",
		email: "facilitair@riedel.example",
		memberships: [{ organizationId: "org-shltr", role: "customer" }],
		customerIn: {
			organizationId: "org-shltr",
			customer: "Riedel B.V.",
			reports: [
				{
					description: "Sectionaaldeur expeditie gaat niet meer open, motor bromt wel.",
					priority: "urgent",
					hoursAgo: 3,
				},
				{
					description: "Snelroldeur maakt een schurend geluid bij het sluiten.",
					priority: "normal",
					hoursAgo: 26,
				},
				{
					description: "Dockleveller zakt langzaam weg als er een vrachtwagen staat.",
					priority: "high",
					hoursAgo: 75,
					decision: { accepted: true },
				},
				{
					description: "Deurdranger kantoordeur sluit te hard.",
					priority: "normal",
					hoursAgo: 120,
					decision: {
						rejectionReason:
							"Deze deur valt niet onder ons onderhoud; neem contact op met de installateur van het pand.",
					},
				},
			],
		},
	},
	{
		name: "Rob Weggemans",
		email: "rob@weggemans.example",
		memberships: [{ organizationId: "org-shltr", role: "customer" }],
		customerIn: {
			organizationId: "org-shltr",
			customer: "Weggemans Logistiek",
			reports: [
				{
					description: "Overheaddeur dock 2 blijft halverwege hangen.",
					priority: "high",
					hoursAgo: 5,
				},
			],
		},
	},
	{
		// A contact of North's first customer, without reports of their own yet.
		name: "Bram de Wit",
		email: "klant@fieldworks.example",
		memberships: [{ organizationId: "org-north", role: "customer" }],
		customerIn: { organizationId: "org-north" },
	},
];
