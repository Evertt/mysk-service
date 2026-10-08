/**
 * Valibot building blocks for remote form schemas. Form fields arrive as strings, so ids and
 * optional values are transformed here; number inputs (`.as("number")`) arrive as numbers.
 *
 * Messages are translated when validation runs (on the server in the request's language, in the
 * browser in the page's): pass a message function, e.g. `text(m.customers_name_required)`, never
 * its text (`m.customers_name_required()` at module scope would always be English).
 */
import * as v from "valibot";

import { fitsUnit } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";

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

/** A required, trimmed text. */
export const text = (message: Message = m.validation_required) =>
	v.pipe(v.string(), v.trim(), v.nonEmpty(message));

/** Whether `value` (`yyyy-mm-dd`) is a day on the calendar, so not e.g. `2026-02-31`. */
const isDay = (value: string) => {
	const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)?.map(Number) ?? [];
	const date = new Date(year, month - 1, day);
	return date.getMonth() === month - 1 && date.getDate() === day;
};

/** The day a valid date input stands for (checked only once there's a value). */
const day = () =>
	v.check((value: string) => value === "" || isDay(value), m.validation_date_invalid);

/** An optional date from `<input type="date">`, as a local date at the start of the day. */
export const optionalDate = () =>
	v.pipe(
		v.string(),
		day(),
		v.transform((value) => (value ? new Date(`${value}T00:00`) : null)),
	);

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

/** An amount entered in euros (e.g. with `MoneyField`), stored in cents. */
export const cents = (required: Message = m.validation_amount_required) =>
	v.pipe(
		// An empty number input arrives as undefined; say so rather than "expected number".
		v.number(required),
		v.minValue(0, m.validation_not_negative),
		v.transform((euros) => Math.round(euros * 100)),
	);

/** A required date from `<input type="date">`, as a local date at the start of the day. */
export const date = (required: Message = m.validation_date_required) =>
	v.pipe(
		v.string(),
		v.nonEmpty(required),
		day(),
		v.transform((value) => new Date(`${value}T00:00`)),
	);

/**
 * A required, trimmed text in a given format. The format is only checked once there's a value,
 * so an empty field gets just the "required" message.
 */
export const formatted = (required: Message, pattern: RegExp, message: Message) =>
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

/**
 * An order's material lines, for the order form and the engineer portal: a material and a
 * quantity each. Pieces are only counted whole; saving checks that against the material's unit.
 */
export const orderLines = () =>
	v.optional(
		v.array(
			v.object({
				materialId: id(m.validation_material_required),
				quantity: v.pipe(
					v.number(m.validation_quantity_required),
					v.gtValue(0, m.validation_more_than_zero),
					v.check((quantity) => fitsUnit(quantity, "m"), m.validation_two_decimals),
				),
			}),
		),
		[],
	);
