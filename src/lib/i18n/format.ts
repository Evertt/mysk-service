/**
 * Formatting for display, in the current language (`getLocale()`: the request's on the server, the
 * page's in the browser, so server-rendered and hydrated pages agree). The formatters read the
 * locale on every call, so they're safe to create at module scope; pass `locale` to override it.
 */
import { getTimeZone, isDay } from "#lib/dates.ts";
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
 * What a date formatter formats: a day (`Temporal.PlainDate`, as it is), a moment
 * (`Temporal.Instant`, in the user's time zone), or a `Date` (better-auth's, e.g. an invitation's
 * expiry).
 */
export type Formattable = Temporal.PlainDate | Temporal.Instant | Date;

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
 * Formats a count or quantity, with at most two decimals, e.g. `2.5` or `1,250`; in Dutch `2,5`
 * or `1.250`.
 */
export const formatNumber = numberFormatter({ maximumFractionDigits: 2 });
