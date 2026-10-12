/**
 * Range filters: the rows whose date or number lies between two bounds, either of which may be
 * open. Pure, so the URL (`url-state.ts`), the list's query (`dateRange` and `numberRange` in
 * `list-definition.ts`), the client-side tables' filter functions (`features.ts`) and the filters'
 * components read a range the same way.
 *
 * In the URL a range is one token (see `url-state.ts`), both bounds inclusive:
 *
 * | Token                    | Means                                                       |
 * | ------------------------ | ----------------------------------------------------------- |
 * | `2026-10-01..2026-10-07` | from 1 October to 7 October 2026, both days included        |
 * | `2026-10-01..`           | on or after 1 October 2026                                  |
 * | `..2026-10-07`           | on or before 7 October 2026                                 |
 * | `2026-10-01`             | on that day                                                 |
 * | `this-week`              | a preset (`datePresets`), relative to the day it's read on  |
 * | `5..10`, `..10`, `5..`   | numbers from 5 to 10, at most 10, at least 5                |
 * | `0`                      | exactly 0                                                   |
 *
 * A preset stays a preset in the URL, so a link or a saved view ("scheduled this week") means the
 * current week whenever it's opened; the list's query (`toListQuery()`) has it as the days it
 * means on the day it's built, in the browser's time zone.
 */
import { addDays, startOfMonth, startOfWeek, toDateInput } from "#lib/dates.ts";

/** How a range filter is written in the URL, besides a set of values (`"set"`). */
export type RangeGrammar = "dateRange" | "numberRange";

/** A range: rows whose value is from `from` to `to`, both included; `null` for an open end. */
export interface Range<T> {
	from: T | null;
	to: T | null;
}

/** A range of days (`yyyy-mm-dd`, as `<input type="date">` has them). */
export type DateRange = Range<string>;

export type NumberRange = Range<number>;

/** The presets a date range can be, relative to today: weeks start on Monday. */
export const datePresets = [
	"today",
	"yesterday",
	"tomorrow",
	"this-week",
	"last-week",
	"next-week",
	"this-month",
	"last-month",
	"next-month",
	"this-year",
	"last-year",
	"last-7-days",
	"next-7-days",
	"last-30-days",
	"next-30-days",
	"before-today",
	"from-today",
] as const;

export type DatePreset = (typeof datePresets)[number];

export const isDatePreset = (token: string): token is DatePreset =>
	(datePresets as readonly string[]).includes(token);

/** Between the bounds in the URL. */
const separator = "..";

/** Whether `text` is a real day as `yyyy-mm-dd`, e.g. not `2026-02-30`. */
export function isDay(text: unknown): text is string {
	if (typeof text !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
	const [year, month, day] = text.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** The start of a day (`yyyy-mm-dd`), in the local time zone. */
export const dayStart = (day: string) => new Date(`${day}T00:00`);

/** The largest number a number range takes, either way: well within what SQLite and JS agree on. */
const rangeNumberLimit = 1e12;

/** A number as the URL writes it: digits, maybe a minus and decimals (`-2.5`), no exponent. */
const numberPattern = /^-?\d{1,13}(\.\d{1,6})?$/;

/** Whether `value` is a number a number range takes. */
export const isRangeNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= rangeNumberLimit;

/** Whether a range has a bound, and its bounds are in order. */
export function isOrdered<T extends string | number>(range: Range<T>) {
	if (range.from === null && range.to === null) return false;
	return range.from === null || range.to === null || range.from <= range.to;
}

/** The two bounds of a token, `a..b`, or a single value as both; `undefined` if more than two. */
function bounds(token: string): [string, string] | undefined {
	const at = token.indexOf(separator);
	if (at === -1) return [token, token];
	const rest = token.slice(at + separator.length);
	return rest.includes(separator) ? undefined : [token.slice(0, at), rest];
}

/** The days a preset means, on `today` (local). */
export function presetRange(preset: DatePreset, today = new Date()): DateRange {
	const day = (date: Date) => toDateInput(date);
	const span = (from: Date, to: Date) => ({ from: day(from), to: day(to) });
	const week = startOfWeek(today);
	const month = startOfMonth(today);
	const monthFrom = (offset: number) => new Date(month.getFullYear(), month.getMonth() + offset, 1);
	const year = today.getFullYear();
	switch (preset) {
		case "today":
			return span(today, today);
		case "yesterday":
			return span(addDays(today, -1), addDays(today, -1));
		case "tomorrow":
			return span(addDays(today, 1), addDays(today, 1));
		case "this-week":
			return span(week, addDays(week, 6));
		case "last-week":
			return span(addDays(week, -7), addDays(week, -1));
		case "next-week":
			return span(addDays(week, 7), addDays(week, 13));
		case "this-month":
			return span(month, addDays(monthFrom(1), -1));
		case "last-month":
			return span(monthFrom(-1), addDays(month, -1));
		case "next-month":
			return span(monthFrom(1), addDays(monthFrom(2), -1));
		case "this-year":
			return span(new Date(year, 0, 1), new Date(year, 11, 31));
		case "last-year":
			return span(new Date(year - 1, 0, 1), new Date(year - 1, 11, 31));
		case "last-7-days":
			return span(addDays(today, -6), today);
		case "next-7-days":
			return span(today, addDays(today, 6));
		case "last-30-days":
			return span(addDays(today, -29), today);
		case "next-30-days":
			return span(today, addDays(today, 29));
		case "before-today":
			return { from: null, to: day(addDays(today, -1)) };
		case "from-today":
			return { from: day(today), to: null };
	}
}

/**
 * The days a token means (a preset's on `today`), or `undefined` if it isn't a date range: not
 * days, days that don't exist, no bound at all, or the end before the start.
 */
export function parseDateRange(token: string, today = new Date()): DateRange | undefined {
	const text = token.trim();
	if (isDatePreset(text)) return presetRange(text, today);
	const ends = bounds(text);
	if (!ends) return undefined;
	const [from, to] = ends.map((end) => (end === "" ? null : end));
	if ((from !== null && !isDay(from)) || (to !== null && !isDay(to))) return undefined;
	const range = { from, to };
	return isOrdered(range) ? range : undefined;
}

/** A range of days as the URL's token: `from..to`, an open end left empty, one day on its own. */
export const dateRangeToken = ({ from, to }: DateRange) =>
	from !== null && from === to ? from : `${from ?? ""}${separator}${to ?? ""}`;

/** The numbers a token means, or `undefined` if it isn't a number range. */
export function parseNumberRange(token: string): NumberRange | undefined {
	const ends = bounds(token.trim());
	if (!ends) return undefined;
	if (ends.some((end) => end !== "" && !numberPattern.test(end))) return undefined;
	const [from, to] = ends.map((end) => (end === "" ? null : Number(end)));
	const range = { from, to };
	if ([from, to].some((end) => end !== null && !isRangeNumber(end))) return undefined;
	return isOrdered(range) ? range : undefined;
}

/** A number range as the URL's token, like `dateRangeToken`. */
export const numberRangeToken = ({ from, to }: NumberRange) =>
	from !== null && from === to ? String(from) : `${from ?? ""}${separator}${to ?? ""}`;

/** Whether a token is a range in a grammar, e.g. to keep only those from the URL. */
export const isRangeToken = (grammar: RangeGrammar, token: string) =>
	(grammar === "dateRange" ? parseDateRange(token) : parseNumberRange(token)) !== undefined;

/** Whether a date (a row's) is in a range of days; never when it has none. */
export function dateInRange(value: unknown, { from, to }: DateRange) {
	if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false;
	const day = toDateInput(value);
	return (from === null || day >= from) && (to === null || day <= to);
}

/** Whether a number (a row's) is in a range; never when it has none. */
export function numberInRange(value: unknown, { from, to }: NumberRange) {
	if (typeof value !== "number" || Number.isNaN(value)) return false;
	return (from === null || value >= from) && (to === null || value <= to);
}
