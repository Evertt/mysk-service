/**
 * Date maths on local days, as the app shows and enters them. Adding days goes by the calendar
 * (`setDate`), not by 24 hours, so it stays right across the clocks changing; `DAY` is for
 * durations (e.g. "within 30 days") where an hour more or less doesn't matter.
 */

/** A day in milliseconds. */
export const DAY = 24 * 60 * 60 * 1000;

/** `date` plus `days` calendar days (minus, for negative), at the same time of day. */
export function addDays(date: Date, days: number) {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

/** Midnight at the start of `date`'s day. */
export const startOfDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** Midnight at the start of the day after `date`'s, e.g. as the exclusive end of an inclusive day. */
export const nextDay = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/** Midnight at the start of the Monday of `date`'s week. */
export const startOfWeek = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7));

/** Midnight at the start of the first day of `date`'s month. */
export const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

/** A date for `<input type="date">`, e.g. as the initial value of an edit form. */
export const toDateInput = (date: Date | null | undefined) =>
	date
		? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
		: "";

const pad = (value: number) => String(value).padStart(2, "0");

/** The time of day as `HH:MM`, as in `<input type="time">`. */
export const timeOfDay = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** `day` at `time` (`HH:MM`). */
export function atTime(day: Date, time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	const result = new Date(day);
	result.setHours(hours, minutes, 0, 0);
	return result;
}
