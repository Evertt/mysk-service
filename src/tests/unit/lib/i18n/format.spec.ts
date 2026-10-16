import { describe, expect, test } from "vite-plus/test";

import {
	dateFormatter,
	formatCents,
	formatDate,
	formatDateTime,
	formatNumber,
	formatTime,
	formatTimeAgo,
	formatTimeSlot,
	intlLocale,
	numberFormatter,
} from "#lib/i18n/format.ts";
import { at, day } from "#unit/temporal-support.ts";

describe("formatTimeAgo", () => {
	const now = at("2026-10-14 15:30");

	test("says how long ago in whole minutes, hours or days", () => {
		expect(formatTimeAgo(at("2026-10-14 15:29:30"), now)).toBe("now");
		expect(formatTimeAgo(at("2026-10-14 15:29"), now)).toBe("1 minute ago");
		expect(formatTimeAgo(at("2026-10-14 14:31"), now)).toBe("59 minutes ago");
		expect(formatTimeAgo(at("2026-10-14 12:00"), now)).toBe("3 hours ago");
		expect(formatTimeAgo(at("2026-10-13 15:00"), now)).toBe("yesterday");
		expect(formatTimeAgo(at("2026-10-11 15:00"), now)).toBe("3 days ago");
	});

	test("in Dutch", () => {
		expect(formatTimeAgo(at("2026-10-14 15:29:30"), now, "nl")).toBe("nu");
		expect(formatTimeAgo(at("2026-10-14 15:28"), now, "nl")).toBe("2 minuten geleden");
	});
});

/** Dutch puts a no-break space after the euro sign; written as a plain space here. */
const plain = (text: string) => text.replaceAll(" ", " ");

describe("formatCents", () => {
	test("shows euros with two decimals and thousands separators", () => {
		expect(formatCents(123456)).toBe("€1,234.56");
		expect(formatCents(100_000_000)).toBe("€1,000,000.00");
	});

	test("keeps the cents of small amounts", () => {
		expect(formatCents(0)).toBe("€0.00");
		expect(formatCents(5)).toBe("€0.05");
	});

	test("puts the minus sign before the euro sign", () => {
		expect(formatCents(-1250)).toBe("-€12.50");
	});

	test("in Dutch, with a decimal comma and the euro sign spaced", () => {
		expect(plain(formatCents(123456, "nl"))).toBe("€ 1.234,56");
		expect(plain(formatCents(5, "nl"))).toBe("€ 0,05");
		expect(plain(formatCents(-1250, "nl"))).toBe("€ -12,50");
	});
});

describe("formatDate", () => {
	test("shows the day, the short month and the year", () => {
		expect(formatDate(day("2026-10-20"))).toBe("20 Oct 2026");
	});

	test("shows the local day, also late in the evening", () => {
		expect(formatDate(at("2026-01-01 23:59"))).toBe("1 Jan 2026");
	});

	test("in Dutch, with the Dutch month", () => {
		expect(formatDate(day("2026-10-07"), "nl")).toBe("7 okt 2026");
		expect(formatDate(day("2026-03-01"), "nl")).toBe("1 mrt 2026");
	});

	test("formats a range of days", () => {
		const [start, end] = [day("2026-10-05"), day("2026-10-11")];
		expect(formatDate.range(start, end)).toMatch(/^5\s?–\s?11 Oct 2026$/);
		expect(formatDate.range(start, end, "nl")).toMatch(/^5\s?–\s?11 okt 2026$/);
	});
});

describe("formatDateTime", () => {
	test("shows the date and the local time to the minute, on a 24-hour clock", () => {
		expect(formatDateTime(new Date(2026, 9, 7, 14, 5, 59))).toBe("7 Oct 2026, 14:05");
		expect(formatDateTime(at("2026-01-01 00:00"))).toBe("1 Jan 2026, 00:00");
	});

	test("in Dutch", () => {
		expect(formatDateTime(at("2026-10-07 14:05"), "nl")).toBe("7 okt 2026, 14:05");
	});
});

test("formatTime shows the time of day on a 24-hour clock in both languages", () => {
	expect(formatTime(at("2026-10-07 09:30"))).toBe("09:30");
	expect(formatTime(at("2026-10-07 21:05"), "nl")).toBe("21:05");
});

test("formatTimeSlot shows two times of day as stored, whatever the user's time zone", () => {
	// A slot is no moment: the zone doesn't shift it.
	expect(formatTimeSlot("07:00", "15:00").replace(/\s/g, "")).toBe("07:00–15:00");
	expect(formatTimeSlot("06:30", "14:00", "nl").replace(/\s/g, "")).toBe("06:30–14:00");
});

describe("formatNumber", () => {
	test("groups thousands and shows at most two decimals", () => {
		expect(formatNumber(1250)).toBe("1,250");
		expect(formatNumber(2.5)).toBe("2.5");
		expect(formatNumber(2.125)).toBe("2.13");
		expect(formatNumber(0)).toBe("0");
	});

	test("in Dutch, with a decimal comma and dots between thousands", () => {
		expect(formatNumber(1250, "nl")).toBe("1.250");
		expect(formatNumber(2.5, "nl")).toBe("2,5");
	});
});

describe("custom formatters", () => {
	test("follow the language they're called in, also when created up front", () => {
		const weekday = dateFormatter({ weekday: "long" });
		const monday = day("2026-10-05");
		expect(weekday(monday)).toBe("Monday");
		expect(weekday(monday, "nl")).toBe("maandag");

		const percent = numberFormatter({ style: "percent" });
		expect(percent(0.21)).toBe("21%");
		expect(plain(percent(0.21, "nl"))).toBe("21%");
	});

	test("intlLocale gives the regional locale of a language", () => {
		expect(intlLocale()).toBe("en-GB");
		expect(intlLocale("nl")).toBe("nl-NL");
	});
});
