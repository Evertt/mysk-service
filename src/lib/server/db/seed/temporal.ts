/**
 * The seed generates its data with faker, in `Date`s (in the seed's time zone, see `time-zone.ts`),
 * and stores days and moments as the app has them (see `day` and `moment` in `../columns.ts`):
 * these turn one into the other where the data is inserted, or handed to the app's own code.
 */

/** A generated date's day, in the seed's time zone. */
export const toDay = (date: Date) =>
	Temporal.Instant.fromEpochMilliseconds(date.getTime())
		.toZonedDateTimeISO(Temporal.Now.timeZoneId())
		.toPlainDate();

/** A generated date as a moment. */
export const toMoment = (date: Date) => Temporal.Instant.fromEpochMilliseconds(date.getTime());

/** A moment that may be missing. */
export const toMomentOrNull = (date: Date | null) => (date ? toMoment(date) : null);

/** A day as a generated date: its midnight, in the seed's time zone. */
export const fromDay = (day: Temporal.PlainDate) => new Date(day.year, day.month - 1, day.day);
