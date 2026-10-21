/**
 * A shell's feed of the tenant's changes, as its tab hears them: `liveFeed()` on the server
 * (`#lib/server/live.ts`) answers it, `ChangeFeed` (`#lib/components/activity/change-feed.ts`)
 * tells the components that follow a record. The office's is `watchTenantChanges`, the engineer
 * portal's `watchFieldChanges` (both through `feedFor()`).
 */
import type { ChangeType } from "./subjects.ts";

/** One of `liveFeed()`'s answers. */
export interface FeedAnswer<T> {
	/** When this stream started watching (epoch ms, the server's clock): it has every change since. */
	since: number;
	/** When it answered: the changes up to then are in this answer or an earlier one. */
	now: number;
	/**
	 * The changes of the last `FEED_WINDOW` ms (`#lib/server/live.ts`), the latest of each record,
	 * oldest first.
	 */
	changes: T[];
}

/** A change to one of the tenant's records, as a tab's feed tells it. */
export interface TenantChange {
	/** E.g. `order`. */
	type: ChangeType;
	/** The record's id, as text; `null` for a change announced for its type only. */
	id: string | null;
	/** What was done, e.g. `updated` (an activity action). */
	action: string;
	/** Who did it, `""` for the system. */
	name: string;
	/** Whether the signed-in user did it. */
	mine: boolean;
	/** When (epoch ms, the server's clock). */
	at: number;
}

/** One of a shell's feed's answers. */
export type TenantChanges = FeedAnswer<TenantChange>;
