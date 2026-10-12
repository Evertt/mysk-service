import { describe, expect, test } from "vite-plus/test";

import {
	dateInRange,
	dateRangeToken,
	datePresets,
	isDay,
	isRangeToken,
	numberInRange,
	numberRangeToken,
	parseDateRange,
	parseNumberRange,
	presetRange,
} from "#lib/components/data-table/ranges.ts";

/** Wednesday 14 October 2026, in the afternoon. */
const today = new Date(2026, 9, 14, 15, 30);

describe("isDay", () => {
	test("takes real days as yyyy-mm-dd", () => {
		expect(isDay("2026-10-14")).toBe(true);
		expect(isDay("2028-02-29")).toBe(true);
	});

	test.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-14", "14-10-2026", "", 20261014])(
		"refuses %j",
		(text) => {
			expect(isDay(text)).toBe(false);
		},
	);
});

describe("presets", () => {
	test.each<[string, string | null, string | null]>([
		["today", "2026-10-14", "2026-10-14"],
		["yesterday", "2026-10-13", "2026-10-13"],
		["tomorrow", "2026-10-15", "2026-10-15"],
		// Weeks start on Monday.
		["this-week", "2026-10-12", "2026-10-18"],
		["last-week", "2026-10-05", "2026-10-11"],
		["next-week", "2026-10-19", "2026-10-25"],
		["this-month", "2026-10-01", "2026-10-31"],
		["last-month", "2026-09-01", "2026-09-30"],
		["next-month", "2026-11-01", "2026-11-30"],
		["this-year", "2026-01-01", "2026-12-31"],
		["last-year", "2025-01-01", "2025-12-31"],
		// Today included.
		["last-7-days", "2026-10-08", "2026-10-14"],
		["next-7-days", "2026-10-14", "2026-10-20"],
		["last-30-days", "2026-09-15", "2026-10-14"],
		["next-30-days", "2026-10-14", "2026-11-12"],
		["before-today", null, "2026-10-13"],
		["from-today", "2026-10-14", null],
	])("%s is from %s to %s", (preset, from, to) => {
		expect(parseDateRange(preset, today)).toEqual({ from, to });
	});

	test("every preset has its days", () => {
		for (const preset of datePresets) {
			expect(parseDateRange(preset, today), preset).toBeDefined();
		}
	});

	test("go by the calendar across months, years and leap days", () => {
		// A Sunday: still the week that began on Monday.
		expect(presetRange("this-week", new Date(2026, 10, 1))).toEqual({
			from: "2026-10-26",
			to: "2026-11-01",
		});
		// A Monday at midnight.
		expect(presetRange("this-week", new Date(2026, 10, 2))).toEqual({
			from: "2026-11-02",
			to: "2026-11-08",
		});
		expect(presetRange("last-month", new Date(2027, 0, 31))).toEqual({
			from: "2026-12-01",
			to: "2026-12-31",
		});
		expect(presetRange("next-month", new Date(2028, 0, 31))).toEqual({
			from: "2028-02-01",
			to: "2028-02-29",
		});
		expect(presetRange("next-week", new Date(2026, 11, 30))).toEqual({
			from: "2027-01-04",
			to: "2027-01-10",
		});
	});

	test("follow the day they're read on", () => {
		expect(parseDateRange("today", new Date(2026, 11, 31))).toEqual({
			from: "2026-12-31",
			to: "2026-12-31",
		});
	});
});

describe("date ranges in the URL", () => {
	test("read both ends, either end, or one day", () => {
		expect(parseDateRange("2026-10-01..2026-10-07")).toEqual({
			from: "2026-10-01",
			to: "2026-10-07",
		});
		expect(parseDateRange("2026-10-01..")).toEqual({ from: "2026-10-01", to: null });
		expect(parseDateRange("..2026-10-07")).toEqual({ from: null, to: "2026-10-07" });
		expect(parseDateRange("2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
		expect(parseDateRange(" this-week ", today)).toEqual({ from: "2026-10-12", to: "2026-10-18" });
	});

	test.each([
		"",
		"..",
		"2026-10-07..2026-10-01",
		"2026-02-30..",
		"2026-10-01...2026-10-07",
		"2026-10-01..2026-10-07..2026-10-09",
		"yesterday-ish",
		"5..10",
		"2026-10-01T00:00..",
	])("refuse %j", (token) => {
		expect(parseDateRange(token, today)).toBeUndefined();
		expect(isRangeToken("dateRange", token)).toBe(false);
	});

	test("are written back as they're read", () => {
		for (const token of ["2026-10-01..2026-10-07", "2026-10-01..", "..2026-10-07", "2026-10-01"]) {
			expect(dateRangeToken(parseDateRange(token)!)).toBe(token);
		}
		expect(dateRangeToken({ from: "2026-10-01", to: "2026-10-01" })).toBe("2026-10-01");
	});
});

describe("number ranges in the URL", () => {
	test("read both ends, either end, or one number", () => {
		expect(parseNumberRange("5..10")).toEqual({ from: 5, to: 10 });
		expect(parseNumberRange("..10")).toEqual({ from: null, to: 10 });
		expect(parseNumberRange("5..")).toEqual({ from: 5, to: null });
		expect(parseNumberRange("0")).toEqual({ from: 0, to: 0 });
		expect(parseNumberRange("-2.5..1.25")).toEqual({ from: -2.5, to: 1.25 });
		expect(parseNumberRange("1.5..3")).toEqual({ from: 1.5, to: 3 });
	});

	test.each([
		"",
		"..",
		"10..5",
		"a..b",
		"1e3..",
		"..0x10",
		".5..",
		"5..10..20",
		"Infinity..",
		"1...5",
	])("refuse %j", (token) => {
		expect(parseNumberRange(token)).toBeUndefined();
		expect(isRangeToken("numberRange", token)).toBe(false);
	});

	test("refuse numbers beyond the limit", () => {
		expect(parseNumberRange("..1000000000000")).toEqual({ from: null, to: 1e12 });
		expect(parseNumberRange("..1000000000001")).toBeUndefined();
	});

	test("are written back as they're read", () => {
		for (const token of ["5..10", "..10", "5..", "7", "-2.5..1.25"]) {
			expect(numberRangeToken(parseNumberRange(token)!)).toBe(token);
		}
	});
});

describe("whether a row's value is in a range", () => {
	test("a date by its day, both ends included", () => {
		const range = { from: "2026-10-12", to: "2026-10-18" };
		expect(dateInRange(new Date(2026, 9, 12, 0, 0), range)).toBe(true);
		expect(dateInRange(new Date(2026, 9, 18, 23, 59), range)).toBe(true);
		expect(dateInRange(new Date(2026, 9, 19, 0, 0), range)).toBe(false);
		expect(dateInRange(new Date(2026, 9, 11, 23, 59), range)).toBe(false);
		expect(dateInRange(new Date(2020, 0, 1), { from: null, to: "2026-10-13" })).toBe(true);
	});

	test("never without a date", () => {
		const range = { from: null, to: "2026-10-13" };
		expect(dateInRange(null, range)).toBe(false);
		expect(dateInRange(undefined, range)).toBe(false);
		expect(dateInRange(new Date(Number.NaN), range)).toBe(false);
	});

	test("a number, both ends included, never without one", () => {
		expect(numberInRange(10, { from: null, to: 10 })).toBe(true);
		expect(numberInRange(10.5, { from: null, to: 10 })).toBe(false);
		expect(numberInRange(5, { from: 5, to: null })).toBe(true);
		expect(numberInRange(4, { from: 5, to: null })).toBe(false);
		expect(numberInRange(null, { from: null, to: 10 })).toBe(false);
	});
});
