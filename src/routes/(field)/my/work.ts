/**
 * The rules of the engineer portal: what an engineer can do with an order in each status, how
 * their work is grouped by day, and what a customer's signature must be.
 */
import * as v from "valibot";

import { startOfDay } from "#lib/dates.js";
import { dateFormatter, formatTime } from "#lib/format.js";
import type { OrderStatus } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

/** What the engineer can do with one of their orders, by its status. */
export function fieldActions(status: OrderStatus) {
	return {
		/** Start the job: a scheduled order is then in progress. */
		start: status === "scheduled",
		/** Log hours and materials, and complete it with the customer's sign-off. */
		work: status === "in_progress",
		/** Write a note, e.g. about access or what they found. */
		note: status === "scheduled" || status === "in_progress",
	};
}

const dayFormat = dateFormatter({ weekday: "long", day: "numeric", month: "long" });
const shortDayFormat = dateFormatter({ day: "numeric", month: "short" });

/**
 * When an order is planned, as a card in its day's group shows it: the time, with the day too if
 * it's work left over from an earlier day (which is grouped under today).
 */
export function plannedTime(date: Date, today = new Date()) {
	return date < startOfDay(today)
		? `${shortDayFormat(date)}, ${formatTime(date)}`
		: formatTime(date);
}

/** A day relative to today: `Today`, `Tomorrow` or e.g. `Friday 9 October`. */
export function dayLabel(day: Date, today = new Date()) {
	const days = Math.round((startOfDay(day).getTime() - startOfDay(today).getTime()) / 86_400_000);
	if (days === 0) return m.portal_today();
	if (days === 1) return m.portal_tomorrow();
	return dayFormat(day);
}

export interface DayGroup<T> {
	/** The day, or `null` for orders without a date. */
	day: Date | null;
	label: string;
	orders: T[];
}

/**
 * Open orders by the day they're planned for, soonest first. Orders planned before today that
 * aren't done yet are still today's work; orders without a date come last.
 */
export function groupByDay<T extends { scheduledFor: Date | null }>(
	orders: T[],
	today = new Date(),
): DayGroup<T>[] {
	const start = startOfDay(today);
	const days = new Map<number, T[]>();
	const undated: T[] = [];
	const sorted = orders.toSorted(
		(a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0),
	);
	for (const order of sorted) {
		if (!order.scheduledFor) {
			undated.push(order);
			continue;
		}
		const day = Math.max(startOfDay(order.scheduledFor).getTime(), start.getTime());
		days.set(day, [...(days.get(day) ?? []), order]);
	}
	const groups: DayGroup<T>[] = [...days]
		.sort(([a], [b]) => a - b)
		.map(([time, dayOrders]) => ({
			day: new Date(time),
			label: dayLabel(new Date(time), today),
			orders: dayOrders,
		}));
	if (undated.length) groups.push({ day: null, label: m.portal_not_planned(), orders: undated });
	return groups;
}

/** A signature as drawn on the canvas: a PNG data URL, at most this long. */
export const MAX_SIGNATURE_LENGTH = 500_000;

/** The customer's signature, from the signature pad: a PNG image as a data URL. */
export const signature = () =>
	v.pipe(
		v.string(),
		v.nonEmpty(m.portal_signature_required),
		v.check(
			(value) => value === "" || /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value),
			m.portal_signature_not_image,
		),
		v.maxLength(MAX_SIGNATURE_LENGTH, m.portal_signature_too_large),
	);
