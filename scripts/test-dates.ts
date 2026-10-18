/**
 * The moments the scheduled end-to-end runs test at (`.github/workflows/dates.yml`; "Testing at
 * another date" in docs/agents/tests.md): the kinds of dates that broke tests before, found from
 * `today` so that they stay ahead of it. Each at 10:00 in Europe/Amsterdam: in working hours, far
 * enough from midnight that a run doesn't cross it, and after a night's clock change.
 *
 *     node scripts/test-dates.ts                                 from today, as JSON for a matrix
 *     node scripts/test-dates.ts "2027-01-01, 2027-03-28T02:30"  those `TEST_NOW`s instead
 */
import { Temporal } from "temporal-polyfill";

import { parseTestNow } from "#clock/clock.ts";

/** The app's zone, whose clock changes the dates include. */
const ZONE = "Europe/Amsterdam";

/** One run's moment. */
interface TestDate {
	/** Its `TEST_NOW`. */
	now: string;
	/** What's risky about it, e.g. `Sunday, clocks go back`. */
	why: string;
}

/**
 * The risky dates from `today` (a day, e.g. `2026-10-18`), in order: the next Saturday and Sunday,
 * this month's last day and the next one's first, the next 1 January, the next clock change in
 * the app's zone, and the 29th to 31st of the next month that follows one of 30 days (where "a
 * month ago" has no same day).
 */
export function riskyDates(today: string): TestDate[] {
	const day = Temporal.PlainDate.from(today);
	const found = new Map<string, string[]>();
	const add = (date: Temporal.PlainDate, why: string) =>
		found.set(date.toString(), [...(found.get(date.toString()) ?? []), why]);

	const saturday = day.add({ days: (6 - day.dayOfWeek + 7) % 7 || 7 });
	add(saturday, "Saturday");
	add(saturday.add({ days: 1 }), "Sunday");

	const last = day.with({ day: day.daysInMonth });
	add(last, "a month's last day");
	add(last.add({ days: 1 }), "a month's first day");
	add(Temporal.PlainDate.from({ year: day.year + 1, month: 1, day: 1 }), "1 January");

	const change = day.toZonedDateTime(ZONE).getTimeZoneTransition("next")!;
	const forward = change.offsetNanoseconds > change.subtract({ minutes: 1 }).offsetNanoseconds;
	add(change.toPlainDate(), forward ? "clocks go forward" : "clocks go back");

	let month = day.toPlainYearMonth();
	const follows30 = (m: Temporal.PlainYearMonth) =>
		m.daysInMonth === 31 &&
		m.subtract({ months: 1 }).daysInMonth === 30 &&
		Temporal.PlainDate.compare(m.toPlainDate({ day: 31 }), day) >= 0;
	while (!follows30(month)) month = month.add({ months: 1 });
	for (const date of [29, 30, 31]) add(month.toPlainDate({ day: date }), "after a 30-day month");

	return [...found]
		.sort(([a], [b]) => Temporal.PlainDate.compare(a, b))
		.map(([date, whys]) => ({ now: `${date}T10:00`, why: whys.join(", ") }));
}

/** The `TEST_NOW`s in `list` (separated by commas or spaces); throws for one that names no moment. */
export function chosenDates(list: string): TestDate[] {
	return list
		.split(/[\s,]+/)
		.filter(Boolean)
		.map((now) => {
			parseTestNow(now, ZONE);
			return { now, why: "chosen" };
		});
}

if (import.meta.main) {
	const list = process.argv.slice(2).join(" ");
	const today = Temporal.Now.plainDateISO(ZONE).toString();
	console.log(JSON.stringify(list.trim() ? chosenDates(list) : riskyDates(today)));
}
