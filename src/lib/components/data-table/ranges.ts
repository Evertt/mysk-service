/**
 * Range filters: the rows whose date, number or amount of money lies between two ends, either of
 * which may be open. Pure, so the URL (`url-state.ts`), the list's query (`dateRange`,
 * `numberRange` and `moneyRange` in `list-definition.ts`), the client-side tables' filter functions
 * (`features.ts`) and the filters' components read a range the same way.
 *
 * A range filter's value in the URL is a list of tokens, comma-separated like a set filter's: the
 * rows in any of them are kept, and on a column that can be empty `none` keeps the rows without a
 * value (`?scheduled=none,this-week`). Each token is a range, both ends included:
 *
 * | Token                         | Means                                                       |
 * | ----------------------------- | ----------------------------------------------------------- |
 * | `2026-10-01..2026-10-07`      | from 1 October to 7 October 2026, both days included        |
 * | `2026-10-01..`                | on or after 1 October 2026                                  |
 * | `..2026-10-07`                | on or before 7 October 2026                                 |
 * | `2026-10-01`                  | on that day                                                 |
 * | `this-week`                   | a preset (`datePresets`), relative to the day it's read on  |
 * | `today..`, `this-week..next-month` | a preset as an end: as the start its first day, as the end its last |
 * | `5..10`, `..10`, `5..`, `0`   | numbers from 5 to 10, at most 10, at least 5, exactly 0     |
 * | `500..`, `..12.50`            | money in euros (at most two decimals), held in cents        |
 *
 * A preset stays a preset in the URL, also as an end, so a link or a saved view ("scheduled this
 * week", "due from today") means the current week whenever it's opened; the list's query
 * (`toListQuery()`) has it as the days it means on the day it's built, in the browser's time zone.
 */
import { addDays, startOfMonth, startOfWeek, toDateInput } from "#lib/dates.ts";

/** How a range filter is written in the URL, besides a set of values (`"set"`). */
export type RangeGrammar = "dateRange" | "numberRange" | "moneyRange";

/** A range: rows whose value is from `from` to `to`, both included; `null` for an open end. */
export interface Range<T> {
	from: T | null;
	to: T | null;
}

/** A range of days (`yyyy-mm-dd`, as `<input type="date">` has them). */
export type DateRange = Range<string>;

/** A range of numbers; for money, of cents. */
export type NumberRange = Range<number>;

/** The value for rows without one, as in a set filter (`noneToken` in `url-state.ts`). */
const none = "none";

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

/** Between the ends in the URL. */
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

/** An amount of euros as the URL writes it: at most two decimals (`12.5`, `-3.05`). */
const euroPattern = /^(-?)(\d{1,10})(?:\.(\d{1,2}))?$/;

/** Whether `value` is a number a number range takes. */
export const isRangeNumber = (value: unknown): value is number =>
	typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= rangeNumberLimit;

/** Whether `value` is an amount of cents a money range takes: a whole number in reach. */
export const isRangeCents = (value: unknown): value is number =>
	isRangeNumber(value) && Number.isInteger(value);

/** Whether a range has an end, and its ends are in order. */
export function isOrdered<T extends string | number>(range: Range<T>) {
	if (range.from === null && range.to === null) return false;
	return range.from === null || range.to === null || range.from <= range.to;
}

/** The two ends of a token, `a..b`, or a single value as both; `undefined` if more than two. */
function ends(token: string): [string, string] | undefined {
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

/** Which end of a range a preset can be: one with a first day can start it, a last day end it. */
export const presetCanBe = (preset: DatePreset, end: keyof DateRange) =>
	presetRange(preset)[end] !== null;

/**
 * The day an end of a date range means: a day as it is, a preset's first day as the start and its
 * last as the end (`undefined` for one without that day, e.g. `before-today` as the start, or for
 * what isn't a day or a preset).
 */
function dateEnd(text: string, end: keyof DateRange, today: Date) {
	if (isDay(text)) return text;
	return isDatePreset(text) ? (presetRange(text, today)[end] ?? undefined) : undefined;
}

/**
 * The days a token means (presets' on `today`), or `undefined` if it isn't a date range: ends that
 * aren't days or presets (or can't be that end), days that don't exist, no end at all, or the end
 * before the start.
 */
export function parseDateRange(token: string, today = new Date()): DateRange | undefined {
	const text = token.trim();
	// A preset on its own is its days, also those with an open end.
	if (isDatePreset(text)) return presetRange(text, today);
	const both = ends(text);
	if (!both) return undefined;
	const [from, to] = [
		both[0] === "" ? null : dateEnd(both[0], "from", today),
		both[1] === "" ? null : dateEnd(both[1], "to", today),
	];
	if (from === undefined || to === undefined) return undefined;
	const range = { from, to };
	return isOrdered(range) ? range : undefined;
}

/**
 * A range of days or presets (its ends as the URL has them) as the URL's token: `from..to`, an open
 * end left empty, one day or preset on its own.
 */
export const dateRangeToken = ({ from, to }: DateRange) =>
	from !== null && from === to ? from : `${from ?? ""}${separator}${to ?? ""}`;

/** The numbers a token means, or `undefined` if it isn't a number range. */
export function parseNumberRange(token: string): NumberRange | undefined {
	const both = ends(token.trim());
	if (!both) return undefined;
	if (both.some((end) => end !== "" && !numberPattern.test(end))) return undefined;
	const [from, to] = both.map((end) => (end === "" ? null : Number(end)));
	const range = { from, to };
	if ([from, to].some((end) => end !== null && !isRangeNumber(end))) return undefined;
	return isOrdered(range) ? range : undefined;
}

/** A number range as the URL's token, like `dateRangeToken`. */
export const numberRangeToken = ({ from, to }: NumberRange) =>
	from !== null && from === to ? String(from) : `${from ?? ""}${separator}${to ?? ""}`;

/** An amount of euros as the URL writes it (`12.5`) in cents, exactly; `undefined` if it isn't one. */
export function euroCents(text: string): number | undefined {
	const match = euroPattern.exec(text);
	if (!match) return undefined;
	const [, sign, euros, fraction = ""] = match;
	// Digits, not floating point: `0.29` is 29 cents, not 28.999….
	const cents = Number(euros) * 100 + Number(fraction.padEnd(2, "0"));
	return sign && cents ? -cents : cents;
}

/** An amount of cents as the URL writes it in euros: `1250` → `12.5`, `1200` → `12`. */
export function centsEuros(cents: number) {
	const sign = cents < 0 ? "-" : "";
	const whole = Math.trunc(Math.abs(cents) / 100);
	const fraction = String(Math.abs(cents) % 100)
		.padStart(2, "0")
		.replace(/0+$/, "");
	return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** The cents a token in euros means, or `undefined` if it isn't a money range. */
export function parseMoneyRange(token: string): NumberRange | undefined {
	const both = ends(token.trim());
	if (!both) return undefined;
	const [from, to] = both.map((end) => (end === "" ? null : euroCents(end)));
	if (from === undefined || to === undefined) return undefined;
	const range = { from, to };
	return isOrdered(range) ? range : undefined;
}

/** A range of cents as the URL's token, in euros, like `dateRangeToken`. */
export const moneyRangeToken = ({ from, to }: NumberRange) =>
	from !== null && from === to
		? centsEuros(from)
		: `${from === null ? "" : centsEuros(from)}${separator}${to === null ? "" : centsEuros(to)}`;

/** A token as a range in a grammar, if it is one. */
function parseRange(grammar: RangeGrammar, token: string, today = new Date()) {
	if (grammar === "dateRange") return parseDateRange(token, today);
	return grammar === "numberRange" ? parseNumberRange(token) : parseMoneyRange(token);
}

/** Whether a token is a value of a range filter in a grammar: a range, or `none`. */
export const isRangeToken = (grammar: RangeGrammar, token: string) =>
	token.trim() === none || parseRange(grammar, token) !== undefined;

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

/**
 * Whether a row's value is in any of a filter's values (its tokens from the URL): a range it's in,
 * or `none` when it has no value (`null` or `undefined`). Tokens that aren't values are left out;
 * with none left, every row is.
 */
export function inAnyRange(grammar: RangeGrammar, value: unknown, tokens: readonly string[]) {
	const today = new Date();
	let any = false;
	for (const token of tokens) {
		if (token.trim() === none) {
			any = true;
			if (value === null || value === undefined) return true;
			continue;
		}
		const range = parseRange(grammar, token, today);
		if (!range) continue;
		any = true;
		const inIt =
			grammar === "dateRange"
				? dateInRange(value, range as DateRange)
				: numberInRange(value, range as NumberRange);
		if (inIt) return true;
	}
	return !any;
}
