/**
 * The records whose pages say when someone else changes them (`<ChangedElsewhere>`, through
 * `watchRecordChanges`), by their activity subject type. `RecordPage` shows the notice on the page
 * of each. Add a type here, and its table to `watchRecordChanges`, to give its pages the notice.
 */
export const watchedTypes = ["order", "customer", "equipment", "engineer"] as const;

/** A record type whose pages say when someone else changes it. */
export type WatchedType = (typeof watchedTypes)[number];
