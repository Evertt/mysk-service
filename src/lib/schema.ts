/**
 * Valibot building blocks for remote form schemas. Form fields arrive as strings, so ids and
 * optional values are transformed here; number inputs (`.as("number")`) arrive as numbers.
 *
 * Messages are translated when validation runs (on the server in the request's language, in the
 * browser in the page's): pass a message function, e.g. `text(m.customers_name_required)`, never
 * its text (`m.customers_name_required()` at module scope would always be English).
 */
import * as v from "valibot";

import { isDay } from "#lib/dates.ts";
import { formatNumber } from "#lib/i18n/format.ts";

/**
 * A validation message: a message function (`m.…`) or one that builds the text, e.g.
 * `() => m.orders_quantity_max({ max })`. A plain string isn't translated; avoid it.
 */
export type Message = string | (() => string);

/** A required id, e.g. from a select. */
export const id = (message: Message = m.validation_choose_one) =>
	v.pipe(
		v.string(),
		v.nonEmpty(message),
		v.transform(Number),
		v.integer(message),
		v.minValue(1, message),
	);

/** An optional id; the empty option means "none". */
export const optionalId = (message: Message = m.validation_choose_one) =>
	v.union([
		v.pipe(
			v.literal(""),
			v.transform(() => null),
		),
		id(message),
	]);

/**
 * A record's id as a command or query takes it, a JSON number (a form's ids are strings: `id()`).
 * Its refusals are a 400, not a message to show: the page sends ids it was given.
 */
export const recordId = () => v.pipe(v.number(), v.integer(), v.minValue(1));

/** A required, trimmed text. */
export const text = (message: Message = m.validation_required) =>
	v.pipe(v.string(), v.trim(), v.nonEmpty(message));

/** At most `max` characters, for a text's pipe: `v.pipe(text(), textMax(80))`. */
export const textMax = (max: number) =>
	v.maxLength<string, number, (issue: v.MaxLengthIssue<string, number>) => string>(max, (issue) =>
		m.validation_text_max({ max: formatNumber(issue.requirement) }),
	);

/** An optional, trimmed text of at most `max` characters; `null` if it's left empty. */
export const optionalText = (max: number) =>
	v.pipe(
		v.string(),
		v.trim(),
		textMax(max),
		v.transform((value) => value || null),
	);

/** The day a valid date input stands for (checked only once there's a value). */
const day = () =>
	v.check((value: string) => value === "" || isDay(value), m.validation_date_invalid);

/** An optional day from `<input type="date">`. */
export const optionalDate = () =>
	v.pipe(
		v.string(),
		day(),
		v.transform((value) => (value ? Temporal.PlainDate.from(value) : null)),
	);

/** An amount entered in euros (e.g. with `MoneyField`), stored in cents. */
export const cents = (required: Message = m.validation_amount_required) =>
	v.pipe(
		// An empty number input arrives as undefined; say so rather than "expected number".
		v.number(required),
		v.minValue(0, m.validation_not_negative),
		v.transform((euros) => Math.round(euros * 100)),
	);

/** A required day from `<input type="date">`. */
export const date = (required: Message = m.validation_date_required) =>
	v.pipe(
		v.string(),
		v.nonEmpty(required),
		day(),
		v.transform((value) => Temporal.PlainDate.from(value)),
	);

/**
 * A required, trimmed text in a given format. The format is only checked once there's a value,
 * so an empty field gets just the "required" message.
 */
const formatted = (required: Message, pattern: RegExp, message: Message) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(required),
		v.check((value) => value === "" || pattern.test(value), message),
	);

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A time of day from `<input type="time">`, `HH:MM`. */
export const time = (required: Message = m.validation_time_required) =>
	formatted(required, timePattern, m.validation_time_invalid);

/** An optional time of day from `<input type="time">`, `HH:MM`; `null` if it's left empty. */
export const optionalTime = () =>
	v.pipe(
		v.string(),
		v.trim(),
		v.check((value) => value === "" || timePattern.test(value), m.validation_time_invalid),
		v.transform((value) => value || null),
	);

/** A required email address, stored in lower case. */
export const email = (required: Message = m.validation_email_required) =>
	v.pipe(formatted(required, v.EMAIL_REGEX, m.validation_email_invalid), v.toLowerCase());

/** A required phone number: digits with optional +, spaces, dots, dashes and brackets. */
export const phone = (required: Message = m.validation_phone_required) =>
	formatted(required, /^\+?[\d\s().-]{6,20}$/, m.validation_phone_invalid);

/** The hours of labour on an order. */
export const laborHours = () =>
	v.pipe(v.number(m.validation_hours_required), v.minValue(0, m.validation_not_negative));
