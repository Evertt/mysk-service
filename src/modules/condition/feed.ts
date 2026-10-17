/**
 * The service history of a customer's units ("Activiteitenlog"), made from the records themselves
 * rather than an event table of its own: the orders completed on them, the checklists completed
 * (from checklists, `condition.history`) and the conditions recorded, with their remarks and
 * advice. Merged newest first, and read as a line each. Isomorphic.
 */
import { formatNumber, label } from "#lib/i18n/index.ts";
import type { OrderType } from "#lib/models.ts";

import type { ChecklistEntry } from "./api/extensions.ts";
import type { ConditionSource } from "./model.ts";

/** A unit as an entry names it. */
interface FeedUnit {
	serialNumber: string;
	title: string;
}

interface Common {
	/** Unique in the feed, e.g. `order:12`. */
	key: string;
	at: Temporal.Instant;
	customer: { code: string; name: string };
}

/** An order completed on the units. */
export interface OrderFeedEntry extends Common {
	kind: "order";
	type: OrderType;
	number: string;
	units: FeedUnit[];
	by: string | null;
}

/** A unit's condition recorded. */
export interface ConditionFeedEntry extends Common {
	kind: "condition";
	score: number;
	advice: string | null;
	source: ConditionSource;
	unit: FeedUnit;
	by: string | null;
	order: string | null;
}

/** A checklist completed on a unit. */
type ChecklistFeedEntry = ChecklistEntry & { kind: "checklist" };

export type FeedEntry = OrderFeedEntry | ConditionFeedEntry | ChecklistFeedEntry;

/** The newest `limit` of the entries of all `lists`, newest first (by key when at the same moment). */
export function mergeFeed(lists: readonly (readonly FeedEntry[])[], limit: number): FeedEntry[] {
	return lists
		.flat()
		.toSorted((a, b) => Temporal.Instant.compare(b.at, a.at) || a.key.localeCompare(b.key))
		.slice(0, limit);
}

/** An entry as a line of the log: its kind ("soort"), what happened, and the remark or advice. */
export interface FeedLine {
	soort: string;
	text: string;
	detail: string | null;
	units: FeedUnit[];
}

/** How many units an order's line names before "and n more". */
const NAMED_UNITS = 3;

/** An entry as a line of the log, e.g. "Werkbon keuring 2026 afgerond · 2 afkeurpunten". */
export function feedLine(entry: FeedEntry, timeZone: string): FeedLine {
	switch (entry.kind) {
		case "order": {
			const type = label("orderType", entry.type);
			const more = entry.units.length - NAMED_UNITS;
			return {
				soort: type,
				text: m.condition_feed_order({ type }),
				detail: more > 0 ? m.condition_feed_more_units({ count: more }) : null,
				units: entry.units.slice(0, NAMED_UNITS),
			};
		}
		case "checklist": {
			const kind =
				entry.checklistKind === "inspection"
					? m.condition_feed_kind_inspection()
					: m.condition_feed_kind_maintenance();
			const year = entry.at.toZonedDateTimeISO(timeZone).year;
			const found = entry.rejections
				? m.condition_feed_rejections({ count: entry.rejections })
				: m.condition_feed_all_ok();
			return {
				soort:
					entry.checklistKind === "inspection"
						? m.condition_feed_soort_inspection()
						: m.condition_feed_soort_maintenance(),
				text: `${m.condition_feed_checklist({ kind, year: String(year) })} · ${found}`,
				detail: entry.remarks,
				units: [entry.unit],
			};
		}
		case "condition":
			return {
				soort: entry.advice ? m.condition_feed_soort_advice() : m.condition_feed_soort_condition(),
				text: m.condition_feed_condition({ score: `${formatNumber(entry.score)}%` }),
				detail: entry.advice,
				units: [entry.unit],
			};
	}
}
