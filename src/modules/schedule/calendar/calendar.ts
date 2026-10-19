/**
 * The schedule's views (a month, a week, a day) and the month's calendar maths. Days are
 * `Temporal.PlainDate`s, an order's the day of its moment in the user's time zone, and weeks run
 * Monday to Sunday.
 *
 * The view and its day are in the URL: the week as it always was (`?week=` any day of it, this
 * week without), a month as `?view=month&date=` any day of it, and a day as `?view=day&date=`;
 * without a date, a view shows today's month or day.
 */
import { currentDay, dayOf, mondayOf } from "#lib/dates.ts";
import { dateFormatter } from "#lib/i18n/index.ts";

import { parseDay } from "../board/board.ts";
import type { getScheduleMonth } from "../schedule.remote.ts";

/** What the schedule query returns for a month, and one of its orders. */
export type ScheduleMonth = Awaited<ReturnType<typeof getScheduleMonth>>;
export type ScheduleMonthOrder = ScheduleMonth["orders"][number];

export const scheduleViews = ["month", "week", "day"] as const;
export type ScheduleView = (typeof scheduleViews)[number];

const isView = (value: string | null): value is ScheduleView =>
	(scheduleViews as readonly (string | null)[]).includes(value);

/** The view a schedule URL's search params ask for (the week by default), and a day in it. */
export function viewFromParams(
	params: Pick<URLSearchParams, "get">,
	today = currentDay(),
): { view: ScheduleView; day: Temporal.PlainDate } {
	const asked = params.get("view");
	const view = isView(asked) ? asked : "week";
	const day =
		parseDay(params.get(view === "week" ? "week" : "date")) ??
		// A week's link carried to another view, or the other way round.
		parseDay(params.get(view === "week" ? "date" : "week")) ??
		today;
	return { view, day };
}

/** The first and last day of the period of `view` that `day` is in. */
export function periodOf(view: ScheduleView, day: Temporal.PlainDate) {
	switch (view) {
		case "month": {
			const start = day.with({ day: 1 });
			return { start, end: start.add({ months: 1 }).subtract({ days: 1 }) };
		}
		case "week": {
			const start = mondayOf(day);
			return { start, end: start.add({ days: 6 }) };
		}
		case "day":
			return { start: day, end: day };
	}
}

const within = (
	day: Temporal.PlainDate,
	period: { start: Temporal.PlainDate; end: Temporal.PlainDate },
) =>
	Temporal.PlainDate.compare(day, period.start) >= 0 &&
	Temporal.PlainDate.compare(day, period.end) <= 0;

/**
 * The day that another view of the period of `view` around `day` shows: today, if it's in that
 * period, else its first day. So switching from August's month to the week shows its first week,
 * and from this month to the week this week.
 */
export function focusDay(view: ScheduleView, day: Temporal.PlainDate, today: Temporal.PlainDate) {
	const period = periodOf(view, day);
	return within(today, period) ? today : period.start;
}

/** The period of `view` `steps` periods away from the one `day` is in (back if negative). */
export function shiftPeriod(view: ScheduleView, day: Temporal.PlainDate, steps: number) {
	const { start } = periodOf(view, day);
	switch (view) {
		case "month":
			return start.add({ months: steps });
		case "week":
			return start.add({ weeks: steps });
		case "day":
			return start.add({ days: steps });
	}
}

/**
 * The search part of the URL of `view` at `day` (any day of its period), e.g.
 * `?view=month&date=2026-08-01`; without a day, today's (`?view=month`, and no search at all for
 * the week).
 */
export function viewSearch(view: ScheduleView, day?: Temporal.PlainDate) {
	const start = day && periodOf(view, day).start.toString();
	if (view === "week") return start ? `?week=${start}` : "";
	return start ? `?view=${view}&date=${start}` : `?view=${view}`;
}

/** The six weeks a month's calendar shows, Monday first: the month's and the days around it. */
export function monthWeeks(day: Temporal.PlainDate) {
	const start = mondayOf(day.with({ day: 1 }));
	return Array.from({ length: 6 }, (_, week) =>
		Array.from({ length: 7 }, (_, weekday) => start.add({ days: week * 7 + weekday })),
	);
}

/** The first and last day of the calendar of `day`'s month (`yyyy-mm-dd`), as the server loads it. */
export function monthRange(day: Temporal.PlainDate) {
	const weeks = monthWeeks(day);
	return { from: weeks[0][0].toString(), to: weeks[5][6].toString() };
}

/** Whether `day` is in the same month as `month` (any day of it). */
export const inMonth = (day: Temporal.PlainDate, month: Temporal.PlainDate) =>
	day.year === month.year && day.month === month.month;

/**
 * Scheduled orders by their day (`yyyy-mm-dd`) in the user's time zone, each day sorted by time;
 * orders without a date are left out.
 */
export function groupByDay<T extends { scheduledFor: Temporal.Instant | null }>(orders: T[]) {
	const days = new Map<string, T[]>();
	for (const order of orders) {
		if (!order.scheduledFor) continue;
		const key = dayOf(order.scheduledFor).toString();
		days.set(key, [...(days.get(key) ?? []), order]);
	}
	for (const list of days.values()) {
		list.sort((a, b) => Temporal.Instant.compare(a.scheduledFor!, b.scheduledFor!));
	}
	return days;
}

/**
 * How many of a day's `count` orders its cell lists, at most `room`: all if they fit, else one
 * fewer than the room, for the "+N more" line; and how many are left over.
 */
export function cellEntries(count: number, room = 3) {
	const shown = count <= room ? count : Math.max(room - 1, 0);
	return { shown, more: count - shown };
}

/** A name's initials, e.g. `Jan de Vries` → `JV`, for showing an engineer where room is short. */
export function initials(name: string) {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (!words.length) return "";
	const first = words[0][0];
	const last = words.length > 1 ? words.at(-1)![0] : "";
	return (first + last).toUpperCase();
}

/** A month, e.g. `August 2026` (in Dutch `augustus 2026`). */
export const formatMonth = dateFormatter({ month: "long", year: "numeric" });

/** A weekday's short name, e.g. `Mon` (in Dutch `ma`), for the calendar's header. */
export const formatWeekday = dateFormatter({ weekday: "short" });
