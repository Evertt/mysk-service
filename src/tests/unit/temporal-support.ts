/**
 * Days and moments for tests, written as they read: `day("2026-10-14")`, a `Temporal.PlainDate`,
 * and `at("2026-10-14 15:30")`, the `Temporal.Instant` the wall clock shows then in the runtime's
 * time zone (what `getTimeZone()` answers outside a request).
 */
import { vi } from "vite-plus/test";

import { getTimeZone } from "#lib/dates.ts";

export const day = (text: string) => Temporal.PlainDate.from(text);

export const at = (text: string) =>
	Temporal.PlainDateTime.from(text.replace(" ", "T")).toZonedDateTime(getTimeZone()).toInstant();

/**
 * Makes `Temporal.Now` answer `moment` (in the zone asked for), as Vitest's fake timers do for
 * `Date` only. Undone with `vi.restoreAllMocks()`.
 */
export function freezeNow(moment: Temporal.Instant) {
	vi.spyOn(Temporal.Now, "instant").mockImplementation(() => moment);
	vi.spyOn(Temporal.Now, "zonedDateTimeISO").mockImplementation((zone = getTimeZone()) =>
		moment.toZonedDateTimeISO(zone),
	);
	vi.spyOn(Temporal.Now, "plainDateISO").mockImplementation((zone = getTimeZone()) =>
		moment.toZonedDateTimeISO(zone).toPlainDate(),
	);
}
