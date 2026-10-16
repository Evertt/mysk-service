import { afterEach, describe, expect, test } from "vite-plus/test";

import { overwriteGetTimeZone, runtimeTimeZone } from "#lib/dates.ts";
import {
	cellEntries,
	focusDay,
	formatMonth,
	formatWeekday,
	groupByDay,
	initials,
	inMonth,
	mondayOf,
	monthRange,
	monthWeeks,
	periodOf,
	shiftPeriod,
	viewFromParams,
	viewSearch,
} from "#modules/schedule/calendar/calendar.ts";
import { day } from "#unit/temporal-support.ts";

const params = (search: string) => new URLSearchParams(search);
const today = day("2026-10-07");

describe("the view in the URL", () => {
	test("is the week by default, of today without a day", () => {
		expect(viewFromParams(params(""), today)).toEqual({ view: "week", day: today });
		expect(viewFromParams(params("?view=year"), today)).toEqual({ view: "week", day: today });
	});

	test("the week keeps its ?week= param; the month and the day have ?date=", () => {
		expect(viewFromParams(params("?week=2026-10-12"), today)).toEqual({
			view: "week",
			day: day("2026-10-12"),
		});
		expect(viewFromParams(params("?view=month&date=2026-08-01"), today)).toEqual({
			view: "month",
			day: day("2026-08-01"),
		});
		expect(viewFromParams(params("?view=day&date=2026-08-03"), today)).toEqual({
			view: "day",
			day: day("2026-08-03"),
		});
		// A day that isn't one is today.
		expect(viewFromParams(params("?view=day&date=2026-02-30"), today)).toEqual({
			view: "day",
			day: today,
		});
		// Each takes the other's param when it has none of its own.
		expect(viewFromParams(params("?view=month&week=2026-08-03"), today).day).toEqual(
			day("2026-08-03"),
		);
		expect(viewFromParams(params("?date=2026-08-03"), today).day).toEqual(day("2026-08-03"));
	});

	test("is written with the period's first day, or none for today's", () => {
		expect(viewSearch("month", day("2026-08-17"))).toBe("?view=month&date=2026-08-01");
		expect(viewSearch("week", day("2026-08-06"))).toBe("?week=2026-08-03");
		expect(viewSearch("day", day("2026-08-06"))).toBe("?view=day&date=2026-08-06");
		expect(viewSearch("month")).toBe("?view=month");
		expect(viewSearch("day")).toBe("?view=day");
		expect(viewSearch("week")).toBe("");
	});
});

describe("periods", () => {
	test("weeks start on Monday", () => {
		const monday = day("2026-10-05");
		expect(mondayOf(day("2026-10-05"))).toEqual(monday);
		// Sunday is the last day of the week, not the first.
		expect(mondayOf(day("2026-10-11"))).toEqual(monday);
		expect(mondayOf(day("2026-10-12"))).toEqual(day("2026-10-12"));
		// Across a month and a year.
		expect(mondayOf(day("2027-01-01"))).toEqual(day("2026-12-28"));
	});

	test("a month, a week and a day run from their first to their last day", () => {
		expect(periodOf("month", day("2026-02-14"))).toEqual({
			start: day("2026-02-01"),
			end: day("2026-02-28"),
		});
		expect(periodOf("month", day("2028-02-14")).end).toEqual(day("2028-02-29"));
		expect(periodOf("week", day("2026-10-09"))).toEqual({
			start: day("2026-10-05"),
			end: day("2026-10-11"),
		});
		expect(periodOf("day", today)).toEqual({ start: today, end: today });
	});

	test("paging goes a whole period back or forth, from its start", () => {
		expect(shiftPeriod("month", day("2026-01-31"), 1)).toEqual(day("2026-02-01"));
		expect(shiftPeriod("month", day("2026-01-15"), -1)).toEqual(day("2025-12-01"));
		expect(shiftPeriod("week", day("2026-10-09"), 1)).toEqual(day("2026-10-12"));
		expect(shiftPeriod("day", day("2026-10-31"), 1)).toEqual(day("2026-11-01"));
	});

	test("another view shows today if the period has it, else the period's first day", () => {
		expect(focusDay("month", day("2026-10-20"), today)).toEqual(today);
		expect(focusDay("month", day("2026-08-20"), today)).toEqual(day("2026-08-01"));
		expect(focusDay("week", day("2026-10-09"), today)).toEqual(today);
		expect(focusDay("week", day("2026-10-14"), today)).toEqual(day("2026-10-12"));
		expect(focusDay("day", day("2026-08-03"), today)).toEqual(day("2026-08-03"));
	});
});

describe("a month's calendar", () => {
	const days = (weeks: Temporal.PlainDate[][]) => weeks.flat().map(String);

	test("has six weeks, Monday first, from the Monday on or before the 1st", () => {
		// August 2026 starts on a Saturday.
		const weeks = monthWeeks(day("2026-08-17"));
		expect(weeks).toHaveLength(6);
		expect(weeks.every((week) => week.length === 7)).toBe(true);
		expect(weeks.every((week) => week[0].dayOfWeek === 1)).toBe(true);
		expect(String(weeks[0][0])).toBe("2026-07-27");
		expect(String(weeks[5][6])).toBe("2026-09-06");
		expect(monthRange(day("2026-08-01"))).toEqual({ from: "2026-07-27", to: "2026-09-06" });
	});

	test("starts on the 1st when that's a Monday, and has six weeks even for a short February", () => {
		// February 2027 starts on a Monday and has four weeks of its own.
		expect(monthRange(day("2027-02-10"))).toEqual({ from: "2027-02-01", to: "2027-03-14" });
		// November 2026 starts on a Sunday: the first row is almost all October.
		expect(monthRange(day("2026-11-01"))).toEqual({ from: "2026-10-26", to: "2026-12-06" });
	});

	test("its days follow each other through the clock changes", () => {
		for (const month of ["2026-03-01", "2026-10-01"]) {
			const all = monthWeeks(day(month)).flat();
			expect(new Set(days([all])).size).toBe(42);
			for (let i = 1; i < all.length; i++) {
				expect(all[i - 1].add({ days: 1 })).toEqual(all[i]);
			}
		}
	});

	test("knows its own days from the ones around it", () => {
		const august = day("2026-08-01");
		expect(inMonth(day("2026-08-31"), august)).toBe(true);
		expect(inMonth(day("2026-07-31"), august)).toBe(false);
		expect(inMonth(day("2027-08-01"), august)).toBe(false);
	});

	test("a cell lists what fits, and how many more there are", () => {
		expect(cellEntries(0)).toEqual({ shown: 0, more: 0 });
		expect(cellEntries(3)).toEqual({ shown: 3, more: 0 });
		// The fourth doesn't fit: the third line says "+2 more".
		expect(cellEntries(4)).toEqual({ shown: 2, more: 2 });
		expect(cellEntries(9, 5)).toEqual({ shown: 4, more: 5 });
	});

	test("formatting", () => {
		expect(formatMonth(day("2026-08-01"))).toBe("August 2026");
		expect(formatMonth(day("2026-08-01"), "nl")).toBe("augustus 2026");
		expect(formatWeekday(day("2026-08-03"))).toBe("Mon");
		expect(formatWeekday(day("2026-08-03"), "nl")).toBe("ma");
		expect(initials("Jan de Vries")).toBe("JV");
		expect(initials("  sanne ")).toBe("S");
		expect(initials("")).toBe("");
	});
});

describe("orders by day", () => {
	afterEach(() => overwriteGetTimeZone(() => runtimeTimeZone));

	const order = (id: number, iso: string | null) => ({
		id,
		scheduledFor: iso ? Temporal.Instant.from(iso) : null,
	});

	test("in the user's time zone, through the clock changes, each day by time", () => {
		overwriteGetTimeZone(() => "Europe/Amsterdam");
		const orders = [
			// The clocks go back at 03:00 on 25 October 2026: that day has 25 hours.
			order(1, "2026-10-25T23:30:00+01:00"),
			order(2, "2026-10-24T22:30:00Z"), // 00:30 on the 25th, summer time
			order(3, "2026-10-25T02:30:00+01:00"), // the second 02:30
			order(4, "2026-10-25T23:15:00Z"), // 00:15 on the 26th
			// They go forward at 02:00 on 29 March 2026: that day has 23 hours.
			order(5, "2026-03-29T00:30:00+01:00"),
			order(6, "2026-03-29T23:30:00+02:00"),
			order(7, null),
		];
		const days = groupByDay(orders);
		expect([...days.keys()].toSorted()).toEqual(["2026-03-29", "2026-10-25", "2026-10-26"]);
		expect(days.get("2026-10-25")!.map((o) => o.id)).toEqual([2, 3, 1]);
		expect(days.get("2026-10-26")!.map((o) => o.id)).toEqual([4]);
		expect(days.get("2026-03-29")!.map((o) => o.id)).toEqual([5, 6]);
	});

	test("a moment's day depends on the zone", () => {
		const late = [order(1, "2026-08-03T23:30:00Z")];
		overwriteGetTimeZone(() => "Europe/Amsterdam");
		expect([...groupByDay(late).keys()]).toEqual(["2026-08-04"]);
		overwriteGetTimeZone(() => "America/New_York");
		expect([...groupByDay(late).keys()]).toEqual(["2026-08-03"]);
	});
});
