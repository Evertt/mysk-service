import { describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";

import { formatTerm } from "./display.ts";

const day = (value: string) => new Date(`${value}T00:00`);

describe("formatTerm", () => {
	test.each([
		["2026-01-01", "2026-12-31", "1 year"],
		["2026-01-01", "2027-12-31", "2 years"],
		["2026-07-01", "2027-06-30", "1 year"],
		["2026-01-01", "2027-06-30", "18 months"],
		["2026-03-01", "2026-03-31", "1 month"],
		["2026-01-15", "2026-02-14", "1 month"],
		["2026-01-01", "2026-04-10", "3 months, 10 days"],
		["2026-01-01", "2026-02-01", "1 month, 1 day"],
	])("%s to %s is %s, counting both days", (startsOn, endsOn, term) => {
		expect(formatTerm(day(startsOn), day(endsOn))).toBe(term);
	});

	test("a period shorter than a month is counted in days", () => {
		expect(formatTerm(day("2026-01-01"), day("2026-01-01"))).toBe("1 day");
		expect(formatTerm(day("2026-03-31"), day("2026-04-29"))).toBe("30 days");
	});

	test("a month from the 31st ends on the last day of a shorter month", () => {
		expect(formatTerm(day("2026-03-31"), day("2026-04-30"))).toBe("1 month");
		expect(formatTerm(day("2026-08-31"), day("2026-09-30"))).toBe("1 month");
	});

	test("a month from the end of January ends on the last day of February", () => {
		expect(formatTerm(day("2026-01-31"), day("2026-02-28"))).toBe("1 month");
		expect(formatTerm(day("2026-01-30"), day("2026-02-28"))).toBe("1 month");
		expect(formatTerm(day("2026-01-31"), day("2026-02-27"))).toBe("28 days");
		expect(formatTerm(day("2026-01-31"), day("2026-03-30"))).toBe("2 months");
	});

	test("a year from leap day ends on the last day of February", () => {
		expect(formatTerm(day("2028-02-29"), day("2029-02-28"))).toBe("1 year");
	});

	test("periods across a daylight saving change still count whole days", () => {
		expect(formatTerm(day("2026-03-01"), day("2026-04-10"))).toBe("1 month, 10 days");
		expect(formatTerm(day("2026-10-01"), day("2026-11-10"))).toBe("1 month, 10 days");
	});

	test("in Dutch", () => {
		const englishByDefault = getLocale;
		overwriteGetLocale(() => "nl");
		try {
			expect(formatTerm(day("2026-01-01"), day("2027-12-31"))).toBe("2 jaar");
			expect(formatTerm(day("2026-01-01"), day("2027-06-30"))).toBe("18 maanden");
			expect(formatTerm(day("2026-03-01"), day("2026-04-10"))).toBe("1 maand, 10 dagen");
			expect(formatTerm(day("2026-01-01"), day("2026-01-01"))).toBe("1 dag");
		} finally {
			overwriteGetLocale(englishByDefault);
		}
	});
});
