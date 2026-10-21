/**
 * A customer's site as the portals and the office's records show it, by how much of it the reader
 * sees: only where it is (`address`), or also what's needed on it (`onSite`: whom to ask, when to
 * come, how to get in). The work record (`readWorkRecord()`) and the unit reads (`readUnits()`)
 * select one of these, by their audience's policy.
 */
import { type GetColumnData, type SQL, sql } from "drizzle-orm";

import { customerSite } from "#lib/server/db/schema.ts";

/** Where a site is. */
const addressColumns = {
	id: customerSite.id,
	name: customerSite.name,
	address: customerSite.address,
	postalCode: customerSite.postalCode,
	city: customerSite.city,
} as const;

/** A site's columns, by what the reader sees of it. */
export const siteColumns = {
	address: addressColumns,
	/** What the engineer needs of it: how to get there and in, and when to come. */
	onSite: {
		...addressColumns,
		country: customerSite.country,
		contactName: customerSite.contactName,
		contactPhone: customerSite.contactPhone,
		contactEmail: customerSite.contactEmail,
		contactChannel: customerSite.contactChannel,
		preferredDay: customerSite.preferredDay,
		slotStart: customerSite.slotStart,
		slotEnd: customerSite.slotEnd,
		priority: customerSite.priority,
		accessNotes: customerSite.accessNotes,
	},
} as const;

/** How much of a site the reader sees. */
export type SiteDetail = keyof typeof siteColumns;

/** What `onSite` has besides the address. */
type OnSiteOnly = Omit<typeof siteColumns.onSite, keyof typeof addressColumns>;

/** A site's columns for a reader who sees what's needed on it only where a rule holds. */
export type SiteColumnsWhere = typeof addressColumns & {
	[K in keyof OnSiteOnly]: SQL<GetColumnData<OnSiteOnly[K], "query"> | null>;
};

/**
 * A site's columns for a reader who sees what's needed on it only at the sites `where` holds for
 * (a condition on `customerSite`, joined to the query): the address everywhere, the `onSite`
 * columns there and null elsewhere.
 */
export function siteColumnsWhere(where: SQL): SiteColumnsWhere {
	const only = Object.fromEntries(
		Object.entries(siteColumns.onSite)
			.filter(([key]) => !(key in addressColumns))
			.map(([key, column]) => [key, sql`case when ${where} then ${column} end`.mapWith(column)]),
	);
	return { ...addressColumns, ...only } as SiteColumnsWhere;
}
