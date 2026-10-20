/**
 * Formatting for display, in the current language (`getLocale()`: the request's on the server, the
 * page's in the browser, so server-rendered and hydrated pages agree). The formatters read the
 * locale on every call, so they're safe to create at module scope; pass `locale` to override it.
 */
import { getTimeZone, isDay } from "#lib/dates.ts";
import { m } from "#lib/paraglide/messages.js";
import { getLocale, type Locale } from "#lib/paraglide/runtime.js";

/**
 * The `Intl` locale for each language: British conventions for English (day month year, 24-hour
 * clock), Dutch ones for Dutch (`€ 1.234,56`, `7 okt 2026`).
 */
const intlLocales: Record<Locale, string> = { en: "en-GB", nl: "nl-NL" };

/** The `Intl` locale for the current language (or `locale`), e.g. for `localeCompare`. */
export const intlLocale = (locale: Locale = getLocale()) => intlLocales[locale];

/** A formatter per language, created when first used. */
function perLocale<T>(create: (locale: string) => T) {
	const cache = new Map<Locale, T>();
	return (locale: Locale = getLocale()) => {
		let formatter = cache.get(locale);
		if (!formatter) cache.set(locale, (formatter = create(intlLocales[locale])));
		return formatter;
	};
}

/**
 * What a date formatter formats: a day (`Temporal.PlainDate`) or a time of day
 * (`Temporal.PlainTime`), as they are, a moment (`Temporal.Instant`, in the user's time zone), or
 * a `Date` (better-auth's, e.g. an invitation's expiry).
 */
export type Formattable = Temporal.PlainDate | Temporal.PlainTime | Temporal.Instant | Date;

/**
 * Formats dates with `options` in the current language and the user's time zone (`getTimeZone()`,
 * so the server shows the days and times the browser does), e.g.
 * `const weekday = dateFormatter({ weekday: "long" })` → `weekday(date)`: `Monday` or `maandag`.
 * Also has `.range(start, end)`, e.g. `5–11 Oct 2026`.
 */
export function dateFormatter(options: Intl.DateTimeFormatOptions) {
	const cache = new Map<string, Intl.DateTimeFormat>();
	const formatter = (locale: Locale = getLocale()) => {
		// A zone the options name (e.g. UTC in an email) stays; else the user's.
		const timeZone = options.timeZone ?? getTimeZone();
		const key = `${locale}|${timeZone}`;
		let found = cache.get(key);
		if (!found) {
			cache.set(
				key,
				(found = new Intl.DateTimeFormat(intlLocales[locale], { ...options, timeZone })),
			);
		}
		return found;
	};
	return Object.assign((value: Formattable, locale?: Locale) => formatter(locale).format(value), {
		range: <T extends Formattable>(start: T, end: T, locale?: Locale) =>
			formatter(locale).formatRange(start, end),
	});
}

/** Formats numbers with `options` in the current language, like `dateFormatter`. */
export function numberFormatter(options: Intl.NumberFormatOptions) {
	const formatter = perLocale((locale) => new Intl.NumberFormat(locale, options));
	return (value: number, locale?: Locale) => formatter(locale).format(value);
}

const euros = numberFormatter({ style: "currency", currency: "EUR" });

/** Formats an amount in cents, e.g. `123456` → `€1,234.56`, in Dutch `€ 1.234,56`. */
export const formatCents = (cents: number, locale?: Locale) => euros(cents / 100, locale);

const wholeEuros = numberFormatter({
	style: "currency",
	currency: "EUR",
	maximumFractionDigits: 0,
});

/**
 * Formats an amount in cents in whole euros, rounded (or `round: "floor"` or `"ceil"`), e.g.
 * `20000000` → `€200,000`, in Dutch `€ 200.000`.
 */
export const formatWholeEuros = (
	cents: number,
	{ round = "round", locale }: { round?: "round" | "floor" | "ceil"; locale?: Locale } = {},
) => wholeEuros(Math[round](cents / 100), locale);

const percent = numberFormatter({ style: "percent", maximumFractionDigits: 2 });
const percentBases = { percent: 100, basisPoints: 10_000 };

/**
 * Formats a rate stored in `basis` units, with at most two decimals: in percent (`21` → `21%`, a
 * VAT rate) or in basis points (`380` → `3.8%`); in Dutch `3,8%`.
 */
export const formatPercent = (
	value: number,
	{ basis, locale }: { basis: keyof typeof percentBases; locale?: Locale },
) => percent(value / percentBases[basis], locale);

/** Formats a day, e.g. `7 Oct 2026`, in Dutch `7 okt 2026`. */
export const formatDate = dateFormatter({ day: "numeric", month: "short", year: "numeric" });

/** Formats a moment to the minute, e.g. `7 Oct 2026, 14:05`, in Dutch `7 okt 2026, 14:05`. */
export const formatDateTime = dateFormatter({
	day: "numeric",
	month: "short",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

/** Formats a day without the year, e.g. `7 Oct`, in Dutch `7 okt`. */
export const formatShortDay = dateFormatter({ day: "numeric", month: "short" });

/** Formats a day in full without the year, e.g. `Monday 5 October`, in Dutch `maandag 5 oktober`. */
export const formatLongDay = dateFormatter({ weekday: "long", day: "numeric", month: "long" });

/** Formats a month, e.g. `October 2026`, in Dutch `oktober 2026`. */
export const formatMonth = dateFormatter({ month: "long", year: "numeric" });

/**
 * Formats a day stored as text, e.g. in the activity log: `yyyy-mm-dd`, or, as logged before days
 * were days (`Temporal.PlainDate`), the moment of its midnight, e.g. `2026-10-11T22:00:00.000Z`.
 */
export function formatStoredDay(value: unknown) {
	const text = String(value);
	return formatDate(isDay(text) ? Temporal.PlainDate.from(text) : Temporal.Instant.from(text));
}

/** Formats a moment stored as text (ISO), e.g. in the activity log, to the minute. */
export const formatStoredMoment = (value: unknown) =>
	formatDateTime(Temporal.Instant.from(String(value)));

/** Formats a time of day, e.g. `09:30`. */
export const formatTime = dateFormatter({ hour: "2-digit", minute: "2-digit" });

/**
 * Formats a slot between two times of day as stored (`HH:MM`, e.g. a site's preferred hours), e.g.
 * `07:00–15:00`: `Temporal.PlainTime`s, which no time zone shifts.
 */
export function formatTimeSlot(start: string, end: string, locale?: Locale) {
	return formatTime.range(Temporal.PlainTime.from(start), Temporal.PlainTime.from(end), locale);
}

const relativeTime = perLocale(
	(locale) => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
);

/**
 * Formats how long ago a moment was, as of `now`, in whole minutes, hours or days: `now` (under a
 * minute), `1 minute ago`, `3 hours ago`, `yesterday`; in Dutch `nu`, `1 minuut geleden`.
 */
export function formatTimeAgo(
	moment: Temporal.Instant,
	now: Temporal.Instant = Temporal.Now.instant(),
	locale?: Locale,
) {
	const minutes = Math.floor(now.since(moment).total("minutes"));
	const format = relativeTime(locale);
	if (minutes < 1) return format.format(0, "second");
	if (minutes < 60) return format.format(-minutes, "minute");
	if (minutes < 60 * 24) return format.format(-Math.floor(minutes / 60), "hour");
	return format.format(-Math.floor(minutes / 60 / 24), "day");
}

const twoDigits = (value: number) => String(value).padStart(2, "0");

/**
 * Formats a stopwatch's time in minutes and seconds, `00:07`, `72:30` (the same in every language
 * the app has), e.g. how long a bug report recorded; with `hours`, from an hour on as `1:12:30`,
 * e.g. how long a dock's door has been open.
 */
export function formatStopwatch(milliseconds: number, { hours = false } = {}) {
	const seconds = Math.max(0, Math.floor(milliseconds / 1000));
	const h = hours ? Math.floor(seconds / 3600) : 0;
	const time = `${twoDigits(Math.floor(seconds / 60) - h * 60)}:${twoDigits(seconds % 60)}`;
	return h ? `${h}:${time}` : time;
}

/**
 * Formats a count or quantity, with at most two decimals, e.g. `2.5` or `1,250`; in Dutch `2,5`
 * or `1.250`.
 */
export const formatNumber = numberFormatter({ maximumFractionDigits: 2 });

/** A setting that's on or off: "On" or "Off" (a stored value in the log, too). */
export const formatOnOff = (value: unknown) => (value ? m.common_on() : m.common_off());
