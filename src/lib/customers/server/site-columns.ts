/**
 * A customer's site as the portals and the office's records show it, by how much of it the reader
 * sees: only where it is (`address`), or also what's needed on it (`onSite`: whom to ask, when to
 * come, how to get in). The work record (`readWorkRecord()`) and the unit reads (`readUnits()`)
 * select one of these, by their audience's policy.
 */
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
