/**
 * The maintenance module's domain rules, shared by its tables, the seed, the server and the UI:
 * which orders a plan makes, how a due date moves on, and the ranges the due list and the
 * equipment list's column filter by. Pure, so client code (filters, badges) can import it.
 */
import { getTimeZone } from "#lib/dates.ts";
import type { OrderType } from "#lib/models.ts";

/** The order types a plan makes: a subset of the orders' own. */
export const planOrderTypes = ["maintenance", "inspection"] as const satisfies OrderType[];
export type PlanOrderType = (typeof planOrderTypes)[number];

/** A plan's interval, in whole months. */
export const intervalLimits = { min: 1, max: 60 } as const;

/**
 * The due date `months` after `due`, on the plan's day of the month (`anchorDay`, 1–31), or the
 * month's last day if it's shorter: 31 January + 1 month is 28 (or 29) February, and the step after
 * that is 31 March again, as the anchor stays 31.
 */
export function advanceDueDate(
	due: Temporal.PlainDate,
	months: number,
	anchorDay = due.day,
): Temporal.PlainDate {
	// Temporal stops at a shorter month's last day itself.
	return due.add({ months }).with({ day: anchorDay });
}

/** Today, the user's. */
const todayNow = () => Temporal.Now.plainDateISO(getTimeZone());

/**
 * The due list's ranges, as horizons: due before today (`overdue`), or before today plus 30 or 90
 * days, the overdue ones included. "Every plan" is no range at all.
 */
export const dueRanges = ["overdue", "30-days", "90-days"] as const;
export type DueRange = (typeof dueRanges)[number];

/** The range the due list starts with: overdue plus the next 30 days. */
export const defaultDueRange: DueRange = "30-days";

/** The day before which a plan is due in `range`, seen from `today`. */
export const dueBefore = (range: DueRange, today = todayNow()) =>
	range === "overdue" ? today : today.add({ days: range === "30-days" ? 30 : 90 });

/**
 * Where a unit's next maintenance falls, for the equipment list's column filter: overdue (before
 * today), soon (within 30 days), or no active plan at all (`none`). Later ones are in none of them.
 */
export const nextDueBuckets = ["overdue", "soon", "none"] as const;
export type NextDueBucket = (typeof nextDueBuckets)[number];

/** How many days ahead counts as soon. */
export const SOON_DAYS = 30;

/** Which bucket a next due date falls in, seen from `today` (`later` for one in none of them). */
export function nextDueBucket(
	due: Temporal.PlainDate | null,
	today = todayNow(),
): NextDueBucket | "later" {
	if (!due) return "none";
	if (Temporal.PlainDate.compare(due, today) < 0) return "overdue";
	return Temporal.PlainDate.compare(due, today.add({ days: SOON_DAYS })) < 0 ? "soon" : "later";
}

/** Whether a plan that's due on `due` is overdue `today`. */
export const isOverdue = (due: Temporal.PlainDate, today = todayNow()) =>
	Temporal.PlainDate.compare(due, today) < 0;
