/**
 * The customers' extension points: where modules take part in their pages and in removing a site
 * (see `#lib/extensions/define.ts` and `#lib/server/extensions.ts`). The vote has one caller,
 * `removeSite()` (`server/sites.ts`). Isomorphic, so the slots' types are there for the pages.
 */
import { defineSlot, defineVote } from "#lib/extensions/define.ts";
// Only the type: this file is isomorphic.
import type { Transaction } from "#lib/server/db/index.ts";

/**
 * Cards in the side column of a customer's page, e.g. the partner programme's level and wallet.
 * The components load their own data through their module's remote functions (by the customer's
 * code, checked in the tenant there), and render nothing when they have nothing to say.
 */
export const detailSide = defineSlot<{ code: string }>("customers.detail.side");

/**
 * Cards in the main column of a customer's page, below its recent activity, e.g. the service
 * history of its units. Like the side column's: by the customer's code, loading their own data.
 */
export const detailMain = defineSlot<{ code: string }>("customers.detail.main");

/**
 * Core is about to delete one of the tenant's customer sites, in `tx`; its equipment is gone and
 * the customer keeps another. Anything of a module's that refers to the site would go with it (the
 * keys cascade), unlogged.
 */
export interface SiteRemoval {
	/** The transaction core deletes the site in: a module reads what it has of the site in it. */
	tx: Transaction;
	site: { id: number; customerId: number };
}

/**
 * Whether a customer's site may go (`SiteRemoval`): a module that has records at the site (the
 * docks' dock positions, an energy site) refuses, saying what's there and what to remove first,
 * and the site stays. The sites card shows the refusal.
 */
export const removingSite = defineVote<SiteRemoval>("customers.removingSite");
