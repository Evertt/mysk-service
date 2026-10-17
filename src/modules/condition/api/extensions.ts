/**
 * The condition module's extension points, for the modules that enhance it (see
 * `#lib/extensions/define.ts`): what they know about a unit that its status and service history
 * take in. Checklists answers with the unit's inspection status and its completed checklists,
 * maintenance with its next visit; without them, the condition module goes without.
 */
import type { SQL } from "drizzle-orm";

import { defineCollector } from "#lib/extensions/define.ts";

/**
 * What a module knows of a unit, as SQL over the `equipment` row of the query it goes in
 * (correlated on `equipment.id`), scoped to the tenant and built per request. A module answers
 * with the parts it knows.
 */
export interface UnitSignals {
	/**
	 * The unit's inspection status today: `valid`, `expiring`, `expired`, `rejected` (its latest
	 * inspection rejected a point) or `none` (see `InspectionState` in `../model.ts`).
	 */
	inspection?: SQL<string>;
	/** The day its next maintenance visit is due (`yyyy-mm-dd`), or null. */
	nextDue?: SQL<string | null>;
}

/**
 * The SQL of what the modules know of a unit: asked at once (an immediate collector), since the
 * equipment list's columns are built while its query is. A module that fails fails the list.
 */
export const unitSignals = defineCollector<void, UnitSignals>("condition.signals", {
	onError: "fail",
	now: true,
});

/** Whose service history is asked for: a customer's units, or every unit (`null`). */
export interface HistoryQuery {
	customerId: number | null;
	/** At most this many entries, the newest. */
	limit: number;
}

/** A completed checklist in a unit's service history ("Werkbon keuring 2026 afgerond"). */
export interface ChecklistEntry {
	/** Unique among a module's entries, e.g. `checklist:12`. */
	key: string;
	at: Temporal.Instant;
	checklistKind: "inspection" | "maintenance";
	/** How many points it rejected. */
	rejections: number;
	/** The general remark for the customer, if any. */
	remarks: string | null;
	/** Who completed it. */
	by: string | null;
	order: string;
	unit: { serialNumber: string; title: string };
	customer: { code: string; name: string };
}

/**
 * The completed checklists of the units asked about, newest first. A module that fails is left
 * out: the rest of the history still shows.
 */
export const history = defineCollector<HistoryQuery, ChecklistEntry[]>("condition.history", {
	onError: "skip",
});
