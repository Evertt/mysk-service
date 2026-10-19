/**
 * The rules of the engineer portal: how an engineer's work is grouped by day, and what a customer's
 * signature must be. What they can do with an order in each status is `fieldActions()` in
 * `#lib/orders/lifecycle.ts`.
 */
import * as v from "valibot";

import { currentDay, dayOf } from "#lib/dates.ts";
import { dateFormatter, formatTime } from "#lib/i18n/index.ts";

const dayFormat = dateFormatter({ weekday: "long", day: "numeric", month: "long" });
const shortDayFormat = dateFormatter({ day: "numeric", month: "short" });

/** A moment's day, in the user's time zone. */

/** Today, in the user's time zone. */

/**
 * When an order is planned, as a card in its day's group shows it: the time, with the day too if
 * it's work left over from an earlier day (which is grouped under today).
 */
export function plannedTime(moment: Temporal.Instant, today = currentDay()) {
	return Temporal.PlainDate.compare(dayOf(moment), today) < 0
		? `${shortDayFormat(moment)}, ${formatTime(moment)}`
		: formatTime(moment);
}

/** A day relative to today: `Today`, `Tomorrow` or e.g. `Friday 9 October`. */
export function dayLabel(day: Temporal.PlainDate, today = currentDay()) {
	const days = today.until(day).days;
	if (days === 0) return m.portal_today();
	if (days === 1) return m.portal_tomorrow();
	return dayFormat(day);
}

export interface DayGroup<T> {
	/** The day, or `null` for orders without a date. */
	day: Temporal.PlainDate | null;
	label: string;
	orders: T[];
}

/**
 * Open orders by the day they're planned for (in the user's time zone), soonest first. Orders
 * planned before today that aren't done yet are still today's work; orders without a date come
 * last.
 */
export function groupByDay<T extends { scheduledFor: Temporal.Instant | null }>(
	orders: T[],
	today = currentDay(),
): DayGroup<T>[] {
	const days = new Map<string, T[]>();
	const undated: T[] = [];
	const sorted = orders.toSorted((a, b) =>
		a.scheduledFor && b.scheduledFor ? Temporal.Instant.compare(a.scheduledFor, b.scheduledFor) : 0,
	);
	for (const order of sorted) {
		if (!order.scheduledFor) {
			undated.push(order);
			continue;
		}
		const planned = dayOf(order.scheduledFor);
		const day = (Temporal.PlainDate.compare(planned, today) < 0 ? today : planned).toString();
		days.set(day, [...(days.get(day) ?? []), order]);
	}
	// Days as `yyyy-mm-dd` sort as text.
	const groups: DayGroup<T>[] = [...days]
		.sort(([a], [b]) => (a < b ? -1 : 1))
		.map(([text, dayOrders]) => {
			const day = Temporal.PlainDate.from(text);
			return { day, label: dayLabel(day, today), orders: dayOrders };
		});
	if (undated.length) groups.push({ day: null, label: m.portal_not_planned(), orders: undated });
	return groups;
}

/**
 * A signature as drawn on the canvas: a PNG data URL, at most this long (a drawn one is some tens of
 * thousands). The completion form sends two, which with the rest of the form stay under the
 * smallest request body a deploy takes: adapter-node's default `BODY_SIZE_LIMIT`, 512 KB (Vercel's
 * functions take 4.5 MB, Workers 100 MB), so a larger one gets the form's message, not a 413.
 */
export const MAX_SIGNATURE_LENGTH = 200_000;

/**
 * A signature from the signature pad, the customer's or the engineer's (`required` says who must
 * sign): a PNG image as a data URL.
 */
export const signature = (required = m.portal_signature_required) =>
	v.pipe(
		v.string(),
		v.nonEmpty(required),
		v.check(
			(value) => value === "" || /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value),
			m.portal_signature_not_image,
		),
		v.maxLength(MAX_SIGNATURE_LENGTH, m.portal_signature_too_large),
	);
