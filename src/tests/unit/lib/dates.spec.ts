import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import {
	addDays,
	addMonths,
	atTime,
	DAY,
	dateParts,
	daysInMonth,
	fromDateInput,
	isDateInput,
	isTimeZone,
	nextDay,
	overwriteGetTimeZone,
	runtimeTimeZone,
	startOfDay,
	startOfMonth,
	startOfWeek,
	timeOfDay,
	toDateInput,
	zonedDate,
} from "#lib/dates.ts";

test("a day is 24 hours in milliseconds", () => {
	expect(DAY).toBe(86_400_000);
});

test("addDays goes by calendar days, keeping the time of day", () => {
	expect(addDays(new Date(2026, 9, 7, 14, 30), 3)).toEqual(new Date(2026, 9, 10, 14, 30));
	expect(addDays(new Date(2026, 9, 30, 8), 3)).toEqual(new Date(2026, 10, 2, 8));
	expect(addDays(new Date(2026, 0, 1, 8), -1)).toEqual(new Date(2025, 11, 31, 8));
	expect(addDays(new Date(2026, 9, 7), 0)).toEqual(new Date(2026, 9, 7));
});

test("addDays leaves its argument alone", () => {
	const date = new Date(2026, 9, 7);
	addDays(date, 5);

	expect(date).toEqual(new Date(2026, 9, 7));
});

test("addDays keeps the time of day when the clocks change", () => {
	// 2026-03-29 and 2026-10-25 are when Europe changes its clocks; elsewhere these days are plain
	// ones, and the time of day is kept all the same.
	const before = addDays(new Date(2026, 2, 28, 9), 1);
	expect([before.getDate(), before.getHours()]).toEqual([29, 9]);
	const after = addDays(new Date(2026, 9, 24, 9), 2);
	expect([after.getDate(), after.getHours()]).toEqual([26, 9]);
});

test("startOfDay is midnight of the same day", () => {
	expect(startOfDay(new Date(2026, 9, 7, 23, 59, 59, 999))).toEqual(new Date(2026, 9, 7));
	expect(startOfDay(new Date(2026, 9, 7))).toEqual(new Date(2026, 9, 7));
});

test("nextDay is midnight of the following day, also across a month or year", () => {
	expect(nextDay(new Date(2026, 9, 7, 15))).toEqual(new Date(2026, 9, 8));
	expect(nextDay(new Date(2026, 9, 31, 23, 59))).toEqual(new Date(2026, 10, 1));
	expect(nextDay(new Date(2026, 11, 31))).toEqual(new Date(2027, 0, 1));
});

test("startOfWeek is midnight of the week's Monday, also across a month or year", () => {
	// 2026-10-07 is a Wednesday.
	expect(startOfWeek(new Date(2026, 9, 7, 15))).toEqual(new Date(2026, 9, 5));
	expect(startOfWeek(new Date(2026, 9, 5))).toEqual(new Date(2026, 9, 5));
	// A Sunday belongs to the week that started the Monday before.
	expect(startOfWeek(new Date(2026, 9, 11, 23, 59))).toEqual(new Date(2026, 9, 5));
	expect(startOfWeek(new Date(2026, 10, 1))).toEqual(new Date(2026, 9, 26));
	expect(startOfWeek(new Date(2027, 0, 1))).toEqual(new Date(2026, 11, 28));
});

test("startOfMonth is midnight of the month's first day", () => {
	expect(startOfMonth(new Date(2026, 9, 7, 15))).toEqual(new Date(2026, 9, 1));
	expect(startOfMonth(new Date(2026, 9, 1))).toEqual(new Date(2026, 9, 1));
});

test("toDateInput is the local day as yyyy-mm-dd, or empty", () => {
	expect(toDateInput(new Date(2026, 9, 7, 23, 59))).toBe("2026-10-07");
	expect(toDateInput(new Date(2026, 0, 1))).toBe("2026-01-01");
	expect(toDateInput(null)).toBe("");
	expect(toDateInput(undefined)).toBe("");
});

test("times of day are shown like the time input does, and set a day's time", () => {
	expect(timeOfDay(new Date(2026, 9, 7, 8, 5))).toBe("08:05");
	expect(atTime(new Date(2026, 9, 7), "14:30")).toEqual(new Date(2026, 9, 7, 14, 30));
	expect(atTime(new Date(2026, 9, 7, 23, 59, 59), "09:00")).toEqual(new Date(2026, 9, 7, 9));
});

test("atTime leaves its argument alone", () => {
	const day = new Date(2026, 9, 7, 23, 59, 59);
	atTime(day, "09:00");

	expect(day).toEqual(new Date(2026, 9, 7, 23, 59, 59));
});

describe("in another time zone than the runtime's", () => {
	// Never the runtime's own zone, so the zone maths are what's tested, not `Date`'s local ones.
	const zone = runtimeTimeZone === "America/New_York" ? "Asia/Kolkata" : "America/New_York";
	beforeEach(() => overwriteGetTimeZone(() => zone));
	afterEach(() => overwriteGetTimeZone(() => runtimeTimeZone));

	/** A moment as the zone's wall clock shows it, `yyyy-mm-dd HH:MM`. */
	const wall = (date: Date) =>
		new Intl.DateTimeFormat("sv-SE", {
			timeZone: zone,
			dateStyle: "short",
			timeStyle: "short",
		}).format(date);

	test("days start at the zone's midnight", () => {
		const day = fromDateInput("2026-10-12");
		expect(wall(day)).toBe("2026-10-12 00:00");
		expect(toDateInput(day)).toBe("2026-10-12");
		expect(wall(nextDay(day))).toBe("2026-10-13 00:00");
		expect(wall(startOfWeek(day))).toBe("2026-10-12 00:00");
		expect(wall(startOfMonth(day, 1))).toBe("2026-11-01 00:00");
		expect(wall(atTime(day, "09:30"))).toBe("2026-10-12 09:30");
		expect(timeOfDay(atTime(day, "09:30"))).toBe("09:30");
	});

	test("a moment is on the zone's day, not the runtime's", () => {
		// 03:00 UTC: the evening before in New York, the morning in Kolkata.
		const moment = new Date(Date.UTC(2026, 9, 12, 3, 0));
		const expected = zone === "America/New_York" ? "2026-10-11" : "2026-10-12";
		expect(toDateInput(moment)).toBe(expected);
		expect(toDateInput(startOfDay(moment))).toBe(expected);
		expect(wall(startOfDay(moment)).endsWith("00:00")).toBe(true);
	});

	test("adding days across the clocks changing keeps the time of day", () => {
		overwriteGetTimeZone(() => "America/New_York");
		// The clocks went forward on 8 March 2026 and back on 1 November 2026 there.
		const before = zonedDate(2026, 2, 7, 9, 0);
		expect(addDays(before, 1).getTime() - before.getTime()).toBe(23 * 60 * 60 * 1000);
		expect(dateParts(addDays(before, 1)).hours).toBe(9);
		const autumn = zonedDate(2026, 9, 31, 9, 0);
		expect(addDays(autumn, 1).getTime() - autumn.getTime()).toBe(25 * 60 * 60 * 1000);
		// A time the clocks skip is an hour later.
		expect(timeOfDay(zonedDate(2026, 2, 8, 2, 30))).toBe("03:30");
	});

	test("months carry over, and a shorter month ends on its last day", () => {
		expect(toDateInput(addMonths(fromDateInput("2026-01-31"), 1))).toBe("2026-02-28");
		expect(toDateInput(zonedDate(2026, 12, 1))).toBe("2027-01-01");
		expect(daysInMonth(2028, 1)).toBe(29);
	});
});

test("a day as a date input is real or refused", () => {
	expect(isDateInput("2026-02-28")).toBe(true);
	expect(isDateInput("2026-02-30")).toBe(false);
	expect(isDateInput("2026-2-3")).toBe(false);
	expect(() => fromDateInput("2026-13-01")).toThrow();
});

test("only time zones Intl knows are time zones", () => {
	expect(isTimeZone("Europe/Amsterdam")).toBe(true);
	expect(isTimeZone("Mars/Olympus")).toBe(false);
	expect(isTimeZone("")).toBe(false);
	expect(isTimeZone(42)).toBe(false);
});

test("a time the clocks go back over is its first moment, as with `Date`", () => {
	overwriteGetTimeZone(() => "America/New_York");
	try {
		// 01:30 on 1 November 2026 is first EDT (05:30 UTC), then EST (06:30 UTC).
		expect(zonedDate(2026, 10, 1, 1, 30).toISOString()).toBe("2026-11-01T05:30:00.000Z");
	} finally {
		overwriteGetTimeZone(() => runtimeTimeZone);
	}
});
