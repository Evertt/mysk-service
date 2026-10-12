import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	centsEuros,
	dateInRange,
	dateRangeToken,
	datePresets,
	euroCents,
	inAnyRange,
	isRangeToken,
	moneyRangeToken,
	numberInRange,
	numberRangeToken,
	parseDateRange,
	parseMoneyRange,
	parseNumberRange,
	presetCanBe,
	presetRange,
} from "#lib/components/data-table/ranges.ts";
import { at, day, freezeNow } from "#unit/temporal-support.ts";

/** Wednesday 14 October 2026. */
const today = day("2026-10-14");

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
		expect(presetRange("this-week", day("2026-11-01"))).toEqual({
			from: "2026-10-26",
			to: "2026-11-01",
		});
		// A Monday at midnight.
		expect(presetRange("this-week", day("2026-11-02"))).toEqual({
			from: "2026-11-02",
			to: "2026-11-08",
		});
		expect(presetRange("last-month", day("2027-01-31"))).toEqual({
			from: "2026-12-01",
			to: "2026-12-31",
		});
		expect(presetRange("next-month", day("2028-01-31"))).toEqual({
			from: "2028-02-01",
			to: "2028-02-29",
		});
		expect(presetRange("next-week", day("2026-12-30"))).toEqual({
			from: "2027-01-04",
			to: "2027-01-10",
		});
	});

	test("follow the day they're read on", () => {
		expect(parseDateRange("today", day("2026-12-31"))).toEqual({
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
		expect(dateInRange(at("2026-10-12 00:00"), range)).toBe(true);
		expect(dateInRange(at("2026-10-18 23:59"), range)).toBe(true);
		expect(dateInRange(at("2026-10-19 00:00"), range)).toBe(false);
		expect(dateInRange(at("2026-10-11 23:59"), range)).toBe(false);
		expect(dateInRange(day("2020-01-01"), { from: null, to: "2026-10-13" })).toBe(true);
	});

	test("never without a date", () => {
		const range = { from: null, to: "2026-10-13" };
		expect(dateInRange(null, range)).toBe(false);
		expect(dateInRange(undefined, range)).toBe(false);
		expect(dateInRange("2026-10-01", range)).toBe(false);
	});

	test("a number, both ends included, never without one", () => {
		expect(numberInRange(10, { from: null, to: 10 })).toBe(true);
		expect(numberInRange(10.5, { from: null, to: 10 })).toBe(false);
		expect(numberInRange(5, { from: 5, to: null })).toBe(true);
		expect(numberInRange(4, { from: 5, to: null })).toBe(false);
		expect(numberInRange(null, { from: null, to: 10 })).toBe(false);
	});
});

describe("presets as the ends of a date range", () => {
	test("as the start, a preset is its first day; as the end, its last", () => {
		expect(parseDateRange("today..", today)).toEqual({ from: "2026-10-14", to: null });
		expect(parseDateRange("..yesterday", today)).toEqual({ from: null, to: "2026-10-13" });
		expect(parseDateRange("this-week..next-month", today)).toEqual({
			from: "2026-10-12",
			to: "2026-11-30",
		});
		expect(parseDateRange("2026-10-01..this-week", today)).toEqual({
			from: "2026-10-01",
			to: "2026-10-18",
		});
		// An open end of a preset is open as an end too: from today on.
		expect(parseDateRange("from-today..", today)).toEqual({ from: "2026-10-14", to: null });
		expect(parseDateRange("..before-today", today)).toEqual({ from: null, to: "2026-10-13" });
	});

	test("a preset without that day can't be that end, nor can the ends be the wrong way round", () => {
		for (const token of [
			"before-today..",
			"..from-today",
			"next-week..last-week",
			"today..2026-01-01",
		]) {
			expect(parseDateRange(token, today), token).toBeUndefined();
		}
		expect(presetCanBe("before-today", "from")).toBe(false);
		expect(presetCanBe("before-today", "to")).toBe(true);
		expect(presetCanBe("from-today", "to")).toBe(false);
		expect(presetCanBe("this-week", "from")).toBe(true);
	});

	test("are written back as they're read", () => {
		for (const token of ["today..", "..yesterday", "this-week..next-month", "2026-10-01..today"]) {
			const [from, to] = token.split("..");
			expect(dateRangeToken({ from: from || null, to: to || null })).toBe(token);
		}
	});
});

describe("money", () => {
	test("euros in the URL are cents, digit by digit", () => {
		expect(euroCents("12.5")).toBe(1250);
		expect(euroCents("12.05")).toBe(1205);
		expect(euroCents("0.29")).toBe(29);
		expect(euroCents("1.13")).toBe(113);
		expect(euroCents("-3.5")).toBe(-350);
		expect(euroCents("-0")).toBe(0);
		expect(euroCents("9999999999.99")).toBe(999_999_999_999);
		for (const text of ["1.234", "1,5", "1e3", "", ".5", "€5", "12345678901"]) {
			expect(euroCents(text), text).toBeUndefined();
		}
	});

	test("cents are written as euros, as short as they go", () => {
		expect(centsEuros(1250)).toBe("12.5");
		expect(centsEuros(1205)).toBe("12.05");
		expect(centsEuros(1200)).toBe("12");
		expect(centsEuros(29)).toBe("0.29");
		expect(centsEuros(-350)).toBe("-3.5");
		expect(centsEuros(0)).toBe("0");
	});

	test("a money range is in cents, and written back in euros", () => {
		expect(parseMoneyRange("500..")).toEqual({ from: 50000, to: null });
		expect(parseMoneyRange("..12.50")).toEqual({ from: null, to: 1250 });
		expect(parseMoneyRange("0.1..0.2")).toEqual({ from: 10, to: 20 });
		expect(parseMoneyRange("20..10")).toBeUndefined();
		expect(parseMoneyRange("5.001..")).toBeUndefined();
		for (const token of ["500..", "..12.5", "0.1..0.2", "7"]) {
			expect(moneyRangeToken(parseMoneyRange(token)!)).toBe(token);
		}
		expect(isRangeToken("moneyRange", "..12.50")).toBe(true);
		expect(isRangeToken("moneyRange", "..12.505")).toBe(false);
	});
});

describe("several values", () => {
	beforeEach(() => {
		// In the afternoon.
		freezeNow(at("2026-10-14 15:30"));
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test("keep a row in any of them, `none` the rows without a value", () => {
		const nine = (date: number) => at(`2026-10-${date} 09:00`);
		const keeps = (value: unknown, tokens: string[]) => inAnyRange("dateRange", value, tokens);
		expect(keeps(nine(14), ["none", "today"])).toBe(true);
		// A day as it is.
		expect(keeps(day("2026-10-14"), ["today"])).toBe(true);
		expect(keeps(null, ["none", "today"])).toBe(true);
		expect(keeps(undefined, ["none"])).toBe(true);
		expect(keeps(nine(20), ["none", "today"])).toBe(false);
		expect(keeps(nine(20), ["..2026-10-01", "2026-10-19..2026-10-21"])).toBe(true);
		expect(inAnyRange("numberRange", 7, ["2", "5..8", "12"])).toBe(true);
		expect(inAnyRange("numberRange", 9, ["2", "5..8", "12"])).toBe(false);
		expect(inAnyRange("moneyRange", 1250, ["..12.50"])).toBe(true);
		expect(inAnyRange("moneyRange", 1251, ["..12.50"])).toBe(false);
	});

	test("that aren't values are left out; with none left, every row is kept", () => {
		expect(inAnyRange("numberRange", 9, ["bogus", "2"])).toBe(false);
		expect(inAnyRange("numberRange", 9, ["bogus"])).toBe(true);
		expect(isRangeToken("dateRange", "none")).toBe(true);
	});
});
