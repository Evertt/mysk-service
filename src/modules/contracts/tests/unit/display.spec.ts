import { describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import {
	contractLevelDisplay,
	contractStatusDisplay,
	formatTerm,
	levelOptions,
	slaStateDisplay,
	statusOptions,
} from "#modules/contracts/display.ts";
import { contractLevels, contractStatuses } from "#modules/contracts/model.ts";
import { describeBadges } from "#unit/lib/display.test-support.ts";

const day = (value: string) => Temporal.PlainDate.from(value);

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

describe.each([
	["contract levels", levelOptions, contractLevels],
	["contract statuses", statusOptions, contractStatuses],
])("%s", (_, options, values) => {
	test("offer every value once, in the order of the enum", () => {
		expect(options.map((option) => option.value)).toEqual(values);
	});

	test("have a distinct label for each value", () => {
		const labels = options.map((option) => option.label);
		expect(labels.every((label) => label.trim() !== "")).toBe(true);
		expect(new Set(labels).size).toBe(labels.length);
	});

	test("have an icon for each value", () => {
		expect(options.every((option) => typeof option.icon === "function")).toBe(true);
	});
});

describeBadges("contract level badges", contractLevelDisplay, [
	["basic", "Basic", "outline"],
	["standard", "Standard", "outline"],
	["premium", "Premium", "secondary"],
]);

describeBadges("contract status badges", contractStatusDisplay, [
	["upcoming", "Upcoming", "info"],
	["active", "Active", "success"],
	["expired", "Expired", "neutral"],
]);

describeBadges("response time badges", slaStateDisplay, [
	["on_track", "On track", "info"],
	["at_risk", "At risk", "warning"],
	["overdue", "Overdue", "danger"],
	["responded", "Responded", "success"],
]);
