import { describe, expect, test } from "vite-plus/test";

import { chosenDates, riskyDates } from "./test-dates.ts";

describe("the risky dates", () => {
	test("from a Sunday in October: the weekend the clocks go back, October's end, 1 January", () => {
		expect(riskyDates("2026-10-18")).toEqual([
			{ now: "2026-10-24T10:00", why: "Saturday" },
			{ now: "2026-10-25T10:00", why: "Sunday, clocks go back" },
			{ now: "2026-10-29T10:00", why: "after a 30-day month" },
			{ now: "2026-10-30T10:00", why: "after a 30-day month" },
			{ now: "2026-10-31T10:00", why: "a month's last day, after a 30-day month" },
			{ now: "2026-11-01T10:00", why: "a month's first day" },
			{ now: "2027-01-01T10:00", why: "1 January" },
		]);
	});

	test("from a Saturday in February: the next Saturday, a leap day, March's clock change", () => {
		const dates = riskyDates("2028-02-05");
		expect(dates.map(({ now }) => now)).toEqual([
			"2028-02-12T10:00",
			"2028-02-13T10:00",
			"2028-02-29T10:00",
			"2028-03-01T10:00",
			"2028-03-26T10:00",
			"2028-05-29T10:00",
			"2028-05-30T10:00",
			"2028-05-31T10:00",
			"2029-01-01T10:00",
		]);
		expect(dates.find(({ now }) => now.startsWith("2028-03-26"))?.why).toBe("clocks go forward");
	});

	test("on a month's last day: that day, and the next after a 30-day month once it's past", () => {
		const dates = riskyDates("2026-12-31").map(({ now }) => now.slice(0, 10));
		expect(dates).toContain("2026-12-31");
		expect(dates).toContain("2027-01-01");
		expect(dates).toContain("2026-12-29");
		expect(riskyDates("2027-01-02").map(({ now }) => now.slice(0, 10))).toContain("2027-05-31");
	});
});

test("chosen dates are taken as they are, and one that's no moment is refused", () => {
	expect(chosenDates(" 2027-01-01, 2027-03-28T02:30 2027-03-28T01:00Z")).toEqual([
		{ now: "2027-01-01", why: "chosen" },
		{ now: "2027-03-28T02:30", why: "chosen" },
		{ now: "2027-03-28T01:00Z", why: "chosen" },
	]);
	expect(() => chosenDates("2027-01-01, soon")).toThrow(/TEST_NOW=soon/);
});
