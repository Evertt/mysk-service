import { expect, test } from "vite-plus/test";

import { runtimeTimeZone } from "#lib/dates.ts";
import { TIME_ZONE_COOKIE, timeZoneOf } from "#lib/time-zone.ts";

/** Cookies with only `value` as the time zone's. */
const cookies = (value?: string) => ({
	get: (name: string) => (name === TIME_ZONE_COOKIE ? value : undefined),
});

test("reads the time zone the browser keeps in its cookie", () => {
	expect(timeZoneOf(cookies("Pacific/Auckland"))).toBe("Pacific/Auckland");
});

test("falls back to the runtime's zone without a cookie, or with one Intl doesn't know", () => {
	for (const value of [undefined, "", "Mars/Olympus", "x".repeat(65)]) {
		expect(timeZoneOf(cookies(value)), String(value)).toBe(runtimeTimeZone);
	}
});
