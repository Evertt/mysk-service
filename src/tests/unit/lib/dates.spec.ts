import * as devalue from "devalue";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
	currentDay,
	dayOf,
	getTimeZone,
	isDay,
	isTimeZone,
	mondayOf,
	overwriteGetTimeZone,
	runtimeTimeZone,
	startOfDay,
	temporalReducers,
	temporalRevivers,
} from "#lib/dates.ts";

test("the time zone is the runtime's until something else answers for it", () => {
	expect(getTimeZone()).toBe(runtimeTimeZone);
	overwriteGetTimeZone(() => "Pacific/Kiritimati");
	try {
		expect(getTimeZone()).toBe("Pacific/Kiritimati");
	} finally {
		overwriteGetTimeZone(() => runtimeTimeZone);
	}
});

test("a day as a date input is real or refused", () => {
	expect(isDay("2026-02-28")).toBe(true);
	expect(isDay("2028-02-29")).toBe(true);
	expect(isDay("2026-10-12T00:00")).toBe(false);
});

test.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-14", "14-10-2026", "", 20261014])(
	"%j isn't a day",
	(text) => {
		expect(isDay(text)).toBe(false);
	},
);

test("only time zones Intl knows are time zones", () => {
	expect(isTimeZone("Europe/Amsterdam")).toBe(true);
	expect(isTimeZone("Mars/Olympus")).toBe(false);
	expect(isTimeZone("")).toBe(false);
	expect(isTimeZone(42)).toBe(false);
});

test("days and moments go through devalue as themselves", () => {
	const value = {
		day: Temporal.PlainDate.from("2026-10-12"),
		moment: Temporal.Instant.from("2026-10-12T07:30:00Z"),
		nothing: null,
	};
	const text = devalue.stringify(value, temporalReducers);
	const back = devalue.parse(text, temporalRevivers) as typeof value;
	expect(back.day.equals(value.day)).toBe(true);
	expect(back.moment.equals(value.moment)).toBe(true);
	expect(back.nothing).toBeNull();
});

/** Runs `check` with `getTimeZone()` answering `zone`. */
function inZone(zone: string, check: () => void) {
	overwriteGetTimeZone(() => zone);
	try {
		check();
	} finally {
		overwriteGetTimeZone(() => runtimeTimeZone);
	}
}

afterEach(() => {
	vi.useRealTimers();
});

test("the current day is the user's, not UTC's", () => {
	// 22:30 on 12 October in Amsterdam (UTC+2) is already 13 October in Tokyo.
	vi.useFakeTimers({ now: Date.parse("2026-10-12T20:30:00Z") });
	inZone("Europe/Amsterdam", () => expect(currentDay().toString()).toBe("2026-10-12"));
	inZone("Asia/Tokyo", () => expect(currentDay().toString()).toBe("2026-10-13"));
	inZone("America/Los_Angeles", () => expect(currentDay().toString()).toBe("2026-10-12"));
});

test("the day of a moment is read in the user's zone", () => {
	const moment = Temporal.Instant.from("2026-10-12T22:30:00Z");
	inZone("UTC", () => expect(dayOf(moment).toString()).toBe("2026-10-12"));
	inZone("Europe/Amsterdam", () => expect(dayOf(moment).toString()).toBe("2026-10-13"));
	inZone("Pacific/Honolulu", () => expect(dayOf(moment).toString()).toBe("2026-10-12"));
});

test.each([
	["2026-10-05", "2026-10-05"],
	["2026-10-07", "2026-10-05"],
	// Sunday is the last day of the week, not the first.
	["2026-10-11", "2026-10-05"],
	["2026-10-12", "2026-10-12"],
	// Across a year.
	["2027-01-01", "2026-12-28"],
])("the Monday of %s's week is %s", (day, monday) => {
	expect(mondayOf(Temporal.PlainDate.from(day)).toString()).toBe(monday);
});

test("a day starts at midnight in the user's zone", () => {
	const day = Temporal.PlainDate.from("2026-10-12");
	inZone("UTC", () => expect(startOfDay(day).toString()).toBe("2026-10-12T00:00:00Z"));
	inZone("Europe/Amsterdam", () => expect(startOfDay(day).toString()).toBe("2026-10-11T22:00:00Z"));
	inZone("Asia/Tokyo", () => expect(startOfDay(day).toString()).toBe("2026-10-11T15:00:00Z"));
});

test("a day's start follows the clock change, so a day is 25 hours long when the clocks go back", () => {
	inZone("Europe/Amsterdam", () => {
		// Summer time ends on 25 October 2026 at 03:00.
		const start = startOfDay(Temporal.PlainDate.from("2026-10-25"));
		const next = startOfDay(Temporal.PlainDate.from("2026-10-26"));
		expect(start.toString()).toBe("2026-10-24T22:00:00Z");
		expect(next.toString()).toBe("2026-10-25T23:00:00Z");
		expect(next.epochMilliseconds - start.epochMilliseconds).toBe(25 * 3_600_000);
	});
});
