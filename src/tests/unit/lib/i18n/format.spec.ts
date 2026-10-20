import { describe, expect, test } from "vite-plus/test";

import { overwriteGetTimeZone, runtimeTimeZone } from "#lib/dates.ts";
import {
	dateFormatter,
	formatCents,
	formatDate,
	formatDateTime,
	formatLongDay,
	formatMonth,
	formatNumber,
	formatPercent,
	formatShortDay,
	formatStopwatch,
	formatTime,
	formatTimeAgo,
	formatTimeSlot,
	formatWholeEuros,
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

describe("formatWholeEuros", () => {
	test("rounds to whole euros, or down or up", () => {
		expect(formatWholeEuros(20_000_000)).toBe("€200,000");
		expect(formatWholeEuros(4_999_950)).toBe("€50,000");
		expect(formatWholeEuros(4_999_950, { round: "floor" })).toBe("€49,999");
		expect(formatWholeEuros(50, { round: "ceil" })).toBe("€1");
	});

	test("in Dutch", () => {
		expect(plain(formatWholeEuros(20_000_000, { locale: "nl" }))).toBe("€ 200.000");
	});
});

describe("formatPercent", () => {
	test("reads a rate in percent, without trailing zeros", () => {
		expect(formatPercent(21, { basis: "percent" })).toBe("21%");
		expect(formatPercent(5.5, { basis: "percent" })).toBe("5.5%");
	});

	test("reads a rate in basis points", () => {
		expect(formatPercent(380, { basis: "basisPoints" })).toBe("3.8%");
		expect(formatPercent(250, { basis: "basisPoints" })).toBe("2.5%");
	});

	test("in Dutch", () => {
		expect(formatPercent(5.5, { basis: "percent", locale: "nl" })).toBe("5,5%");
		expect(formatPercent(380, { basis: "basisPoints", locale: "nl" })).toBe("3,8%");
	});
});

describe("formatStopwatch", () => {
	const time = (minutes: number, seconds = 0, hours = 0) =>
		((hours * 60 + minutes) * 60 + seconds) * 1000;

	test("reads minutes and seconds, the minutes past the hour too", () => {
		expect(formatStopwatch(0)).toBe("00:00");
		expect(formatStopwatch(time(0, 7) + 999)).toBe("00:07");
		expect(formatStopwatch(time(72, 30))).toBe("72:30");
		expect(formatStopwatch(-500)).toBe("00:00");
	});

	test("with hours, reads mm:ss below an hour, as the docks' timers, else h:mm:ss", () => {
		expect(formatStopwatch(time(23, 40), { hours: true })).toBe("23:40");
		expect(formatStopwatch(time(41, 7), { hours: true })).toBe("41:07");
		expect(formatStopwatch(time(27, 20, 1), { hours: true })).toBe("1:27:20");
		expect(formatStopwatch(time(0, 5, 3), { hours: true })).toBe("3:00:05");
	});
});

describe("named day formats", () => {
	test("formatShortDay shows the day and the short month", () => {
		expect(formatShortDay(day("2026-10-07"))).toBe("7 Oct");
		expect(formatShortDay(day("2026-10-07"), "nl")).toBe("7 okt");
	});

	test("formatLongDay shows the weekday, the day and the month in full", () => {
		expect(formatLongDay(day("2026-10-11"))).toBe("Sunday 11 October");
		expect(formatLongDay(day("2026-10-05"), "nl")).toBe("maandag 5 oktober");
	});

	test("formatMonth shows the month and the year", () => {
		expect(formatMonth(day("2026-08-01"))).toBe("August 2026");
		expect(formatMonth(day("2026-08-01"), "nl")).toBe("augustus 2026");
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
	// A slot is no moment: the zone doesn't shift it, not even one 14 hours from UTC.
	for (const zone of [runtimeTimeZone, "Pacific/Kiritimati", "America/Los_Angeles"]) {
		overwriteGetTimeZone(() => zone);
		try {
			expect(formatTimeSlot("07:00", "15:00").replace(/\s/g, ""), zone).toBe("07:00–15:00");
			expect(formatTimeSlot("06:30", "14:00", "nl").replace(/\s/g, ""), zone).toBe("06:30–14:00");
		} finally {
			overwriteGetTimeZone(() => runtimeTimeZone);
		}
	}
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
