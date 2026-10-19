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
 * (`toListQuery()`) has it as the days it means on the day it's built, in the user's time zone.
 */
import { currentDay, dayOf, isDay, mondayOf } from "#lib/dates.ts";

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

/** The days a preset means, on `today` (the user's, by default). */
export function presetRange(preset: DatePreset, today = currentDay()): DateRange {
	const span = (from: Temporal.PlainDate, to: Temporal.PlainDate) => ({
		from: from.toString(),
		to: to.toString(),
	});
	/** The days from the start of `today`'s week, month or year, `offset` of them on, for one. */
	const period = (unit: "weeks" | "months" | "years", offset = 0) => {
		const start = (
			unit === "weeks"
				? mondayOf(today)
				: today.with(unit === "months" ? { day: 1 } : { month: 1, day: 1 })
		).add({ [unit]: offset });
		return span(start, start.add({ [unit]: 1 }).subtract({ days: 1 }));
	};
	const days = (from: number, to: number) =>
		span(today.add({ days: from }), today.add({ days: to }));
	switch (preset) {
		case "today":
			return days(0, 0);
		case "yesterday":
			return days(-1, -1);
		case "tomorrow":
			return days(1, 1);
		case "this-week":
			return period("weeks");
		case "last-week":
			return period("weeks", -1);
		case "next-week":
			return period("weeks", 1);
		case "this-month":
			return period("months");
		case "last-month":
			return period("months", -1);
		case "next-month":
			return period("months", 1);
		case "this-year":
			return period("years");
		case "last-year":
			return period("years", -1);
		case "last-7-days":
			return days(-6, 0);
		case "next-7-days":
			return days(0, 6);
		case "last-30-days":
			return days(-29, 0);
		case "next-30-days":
			return days(0, 29);
		case "before-today":
			return { from: null, to: today.subtract({ days: 1 }).toString() };
		case "from-today":
			return { from: today.toString(), to: null };
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
function dateEnd(text: string, end: keyof DateRange, today: Temporal.PlainDate) {
	if (isDay(text)) return text;
	return isDatePreset(text) ? (presetRange(text, today)[end] ?? undefined) : undefined;
}

/**
 * The days a token means (presets' on `today`), or `undefined` if it isn't a date range: ends that
 * aren't days or presets (or can't be that end), days that don't exist, no end at all, or the end
 * before the start.
 */
export function parseDateRange(token: string, today = currentDay()): DateRange | undefined {
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
 * A range as the URL's token, its ends as `write` has them: `from..to`, an open end left empty, a
 * range of one value that value on its own.
 */
const rangeToken = <T>({ from, to }: Range<T>, write: (end: T) => string) =>
	from !== null && from === to
		? write(from)
		: `${from === null ? "" : write(from)}${separator}${to === null ? "" : write(to)}`;

/** A range of days or presets (its ends as the URL has them) as the URL's token, e.g. `today..`. */
export const dateRangeToken = (range: DateRange) => rangeToken(range, String);

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
export const numberRangeToken = (range: NumberRange) => rangeToken(range, String);

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
export const moneyRangeToken = (range: NumberRange) => rangeToken(range, centsEuros);

/** A token as a range in a grammar, if it is one. */
function parseRange(grammar: RangeGrammar, token: string, today = currentDay()) {
	if (grammar === "dateRange") return parseDateRange(token, today);
	return grammar === "numberRange" ? parseNumberRange(token) : parseMoneyRange(token);
}

/** Whether a token is a value of a range filter in a grammar: a range, or `none`. */
export const isRangeToken = (grammar: RangeGrammar, token: string) =>
	token.trim() === none || parseRange(grammar, token) !== undefined;

/** Whether a date (a row's) is in a range of days; never when it has none. */
export function dateInRange(value: unknown, { from, to }: DateRange) {
	const day =
		value instanceof Temporal.PlainDate
			? value.toString()
			: value instanceof Temporal.Instant
				? dayOf(value).toString()
				: undefined;
	if (day === undefined) return false;
	// Days as `yyyy-mm-dd` sort as text.
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
	const today = currentDay();
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
