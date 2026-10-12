/**
 * Date maths on days and times of day as the user sees them: in their time zone (`getTimeZone()`),
 * whether it runs in the browser (the browser's zone) or on the server (the zone the browser told
 * it, see `src/lib/server/time-zone.ts`; else the server's own). Adding days goes by the calendar,
 * not by 24 hours, so it stays right across the clocks changing; `DAY` is for durations (e.g.
 * "within 30 days") where an hour more or less doesn't matter.
 *
 * Never use a `Date`'s local getters and constructor (`getDate()`, `new Date(year, month, day)`)
 * for days: on the server they're in the server's zone, not the user's. Use `dateParts()` and
 * `zonedDate()`, or the helpers below, which are built on them.
 */

/** A day in milliseconds. */
export const DAY = 24 * 60 * 60 * 1000;

// --- The time zone --------------------------------------------------------------------------------

/** The cookie the browser keeps its time zone in, for the server (see `TimeZoneCookie`). */
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

// --- Calendar parts in a zone ---------------------------------------------------------------------

/** A moment as a wall clock in a zone shows it. `month` from 0, `weekday` from 0 (Sunday). */
export interface DateParts {
	year: number;
	month: number;
	day: number;
	hours: number;
	minutes: number;
	seconds: number;
	milliseconds: number;
	weekday: number;
}

const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(zone: string) {
	let formatter = partsFormatters.get(zone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-US", {
			timeZone: zone,
			hourCycle: "h23",
			weekday: "short",
			year: "numeric",
			month: "numeric",
			day: "numeric",
			hour: "numeric",
			minute: "numeric",
			second: "numeric",
		});
		partsFormatters.set(zone, formatter);
	}
	return formatter;
}

/** `date` as the wall clock in `zone` (the current zone by default) shows it. */
export function dateParts(date: Date, zone = getTimeZone()): DateParts {
	if (zone === runtimeTimeZone) {
		return {
			year: date.getFullYear(),
			month: date.getMonth(),
			day: date.getDate(),
			hours: date.getHours(),
			minutes: date.getMinutes(),
			seconds: date.getSeconds(),
			milliseconds: date.getMilliseconds(),
			weekday: date.getDay(),
		};
	}
	const parts: Record<string, string> = {};
	for (const { type, value } of partsFormatter(zone).formatToParts(date)) parts[type] = value;
	return {
		year: Number(parts.year),
		month: Number(parts.month) - 1,
		day: Number(parts.day),
		hours: Number(parts.hour),
		minutes: Number(parts.minute),
		seconds: Number(parts.second),
		milliseconds: date.getUTCMilliseconds(),
		weekday: weekdays[parts.weekday],
	};
}

/** How far `zone`'s wall clock is ahead of UTC at the moment `time`, in milliseconds. */
function offset(time: number, zone: string) {
	const p = dateParts(new Date(time), zone);
	const wall = Date.UTC(p.year, p.month, p.day, p.hours, p.minutes, p.seconds, p.milliseconds);
	return wall - time;
}

/**
 * The moment the wall clock in `zone` (the current zone by default) shows a time, like
 * `new Date(year, month, day, …)` there: `month` from 0, and parts out of range carry over
 * (`day` 0 is the month before's last). A time the clocks skip is taken as the time it'd have
 * been without the change (an hour later on the new time), and one they go back over as the first.
 */
export function zonedDate(
	year: number,
	month: number,
	day: number,
	hours = 0,
	minutes = 0,
	seconds = 0,
	milliseconds = 0,
	zone = getTimeZone(),
) {
	if (zone === runtimeTimeZone) {
		return new Date(year, month, day, hours, minutes, seconds, milliseconds);
	}
	const wall = Date.UTC(year, month, day, hours, minutes, seconds, milliseconds);
	// The zone's offsets a day before and after: the same, unless the clocks change in between.
	const before = offset(wall - DAY, zone);
	const after = offset(wall + DAY, zone);
	// The moments the wall clock shows this time at: none when the clocks skip it, two when they
	// go back over it (then the first, as `Date` does).
	const moments = [wall - after, wall - before]
		.filter((moment, i, all) => all.indexOf(moment) === i)
		.filter((moment) => moment + offset(moment, zone) === wall)
		.sort((a, b) => a - b);
	// Skipped: as if the clocks hadn't changed yet, so an hour later on the new time.
	return new Date(moments[0] ?? wall - before);
}

// --- Days ------------------------------------------------------------------------------------------

/** `date` plus `days` calendar days (minus, for negative), at the same time of day. */
export function addDays(date: Date, days: number) {
	const p = dateParts(date);
	return zonedDate(p.year, p.month, p.day + days, p.hours, p.minutes, p.seconds, p.milliseconds);
}

/** `date` plus `months` calendar months, on the same day (or the month's last, if it's shorter). */
export function addMonths(date: Date, months: number) {
	const p = dateParts(date);
	const day = Math.min(p.day, daysInMonth(p.year, p.month + months));
	return zonedDate(p.year, p.month + months, day, p.hours, p.minutes, p.seconds, p.milliseconds);
}

/** How many days a month has (`month` from 0; out of range carries over to other years). */
export const daysInMonth = (year: number, month: number) =>
	new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Midnight at the start of `date`'s day. */
export function startOfDay(date: Date) {
	const p = dateParts(date);
	return zonedDate(p.year, p.month, p.day);
}

/** Midnight at the start of the day after `date`'s, e.g. as the exclusive end of an inclusive day. */
export function nextDay(date: Date) {
	const p = dateParts(date);
	return zonedDate(p.year, p.month, p.day + 1);
}

/** Midnight at the start of the Monday of `date`'s week. */
export function startOfWeek(date: Date) {
	const p = dateParts(date);
	return zonedDate(p.year, p.month, p.day - ((p.weekday + 6) % 7));
}

/** Midnight at the start of the first day of `date`'s month, or of the month `months` from it. */
export function startOfMonth(date: Date, months = 0) {
	const p = dateParts(date);
	return zonedDate(p.year, p.month + months, 1);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A date for `<input type="date">`, e.g. as the initial value of an edit form. */
export function toDateInput(date: Date | null | undefined) {
	if (!date) return "";
	const p = dateParts(date);
	return `${p.year}-${pad(p.month + 1)}-${pad(p.day)}`;
}

/** The parts of a day as `<input type="date">` has it (`yyyy-mm-dd`), if it's a real day. */
function dayParts(text: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
	const [year, month, day] = text.split("-").map(Number);
	return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month - 1)
		? { year, month: month - 1, day }
		: undefined;
}

/** Whether `text` is a real day as `yyyy-mm-dd`, e.g. not `2026-02-30`. */
export const isDateInput = (text: string) => dayParts(text) !== undefined;

/** Midnight at the start of a day as `<input type="date">` has it (`yyyy-mm-dd`). */
export function fromDateInput(text: string) {
	const parts = dayParts(text);
	if (!parts) throw new Error(`Not a day: ${text}`);
	return zonedDate(parts.year, parts.month, parts.day);
}

// --- Times of day ----------------------------------------------------------------------------------

/** The time of day as `HH:MM`, as in `<input type="time">`. */
export function timeOfDay(date: Date) {
	const p = dateParts(date);
	return `${pad(p.hours)}:${pad(p.minutes)}`;
}

/** `day` at `time` (`HH:MM`). */
export function atTime(day: Date, time: string) {
	const [hours, minutes] = time.split(":").map(Number);
	const p = dateParts(day);
	return zonedDate(p.year, p.month, p.day, hours, minutes);
}
