/**
 * Days and moments are Temporal's: a day on the calendar is a `Temporal.PlainDate` (a due date, the
 * day a contract starts), a moment a `Temporal.Instant` (when an order was made or is scheduled
 * for); see `day` and `moment` in `#lib/server/db/columns.ts`. Work with them through the Temporal
 * API itself, e.g. `date.add({ days: 1 })`, `Temporal.PlainDate.compare(a, b)` (never `<`: a
 * Temporal value has no `valueOf`), `instant.toZonedDateTimeISO(getTimeZone()).toPlainDate()`.
 *
 * What's here is the time zone a moment is turned into a day or a time of day in: the user's
 * (`getTimeZone()`), on the server too, where the browser told it (see
 * `src/lib/server/time-zone.ts`); else the runtime's own.
 */

/** The cookie the browser keeps its time zone in, for the server (see `src/routes/time-zone.ts`). */
export const TIME_ZONE_COOKIE = "TIME_ZONE";

/** The zone this runtime is in: the browser's, or the server process's. */
export const runtimeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

let currentTimeZone = () => runtimeTimeZone;

/** The time zone days and times are in now: the request's on the server, else the runtime's. */
export const getTimeZone = () => currentTimeZone();

/** Makes `getTimeZone()` answer with `get()`, e.g. the request's zone on the server. */
export function overwriteGetTimeZone(get: () => string) {
	currentTimeZone = get;
}

/** Whether `value` is a time zone `Intl` knows, e.g. `Europe/Amsterdam`. */
export function isTimeZone(value: unknown): value is string {
	if (typeof value !== "string" || !value || value.length > 64) return false;
	try {
		new Intl.DateTimeFormat("en", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** Whether `text` is a real day as `<input type="date">` has it (`yyyy-mm-dd`), not `2026-02-30`. */
export function isDay(text: unknown): text is string {
	if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
	try {
		Temporal.PlainDate.from(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * How days and moments are written as text and read back, for devalue: as SvelteKit sends them
 * between the server and the browser (`transport` in `src/hooks.ts`), and wherever the app keeps
 * values with devalue itself (e.g. a table's widths, `column-widths.svelte.ts`).
 */
export const temporalReducers = {
	PlainDate: (value: unknown) => value instanceof Temporal.PlainDate && value.toString(),
	Instant: (value: unknown) => value instanceof Temporal.Instant && value.toString(),
};

/** Reads what `temporalReducers` wrote. */
export const temporalRevivers = {
	PlainDate: (text: string) => Temporal.PlainDate.from(text),
	Instant: (text: string) => Temporal.Instant.from(text),
};
