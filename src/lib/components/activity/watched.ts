/**
 * The records whose pages say when someone else changes them (`<ChangedElsewhere>`, through
 * `watchRecordChanges`), by their activity subject type. `RecordPage` shows the notice on the page
 * of each. Add a type here, and its table to `watchRecordChanges`, to give its pages the notice.
 */
import type { LoggedType } from "#lib/activity/index.ts";

export const watchedTypes = ["order", "customer", "equipment", "engineer"] as const;

/** A record type whose pages say when someone else changes it. */
export type WatchedType = (typeof watchedTypes)[number];

/** Whether pages of a `type` record say when someone else changes it. */
export const isWatched = (type: LoggedType): type is WatchedType =>
	(watchedTypes as readonly string[]).includes(type);
