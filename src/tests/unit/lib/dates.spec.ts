import * as devalue from "devalue";
import { expect, test } from "vite-plus/test";

import {
	getTimeZone,
	isDay,
	isTimeZone,
	overwriteGetTimeZone,
	runtimeTimeZone,
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
