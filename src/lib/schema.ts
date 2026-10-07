/**
 * Valibot building blocks for remote form schemas. Form fields arrive as strings, so ids and
 * optional values are transformed here; number inputs (`.as("number")`) arrive as numbers.
 */
import * as v from "valibot";

import { fitsUnit } from "#lib/models.js";

/** A required id, e.g. from a select. */
export const id = (message = "Choose one") =>
	v.pipe(
		v.string(),
		v.nonEmpty(message),
		v.transform(Number),
		v.integer(message),
		v.minValue(1, message),
	);

/** An optional id; the empty option means "none". */
export const optionalId = (message = "Choose one") =>
	v.union([
		v.pipe(
			v.literal(""),
			v.transform(() => null),
		),
		id(message),
	]);

/** A required, trimmed text. */
export const text = (message = "Required") => v.pipe(v.string(), v.trim(), v.nonEmpty(message));

/** Whether `value` (`yyyy-mm-dd`) is a day on the calendar, so not e.g. `2026-02-31`. */
const isDay = (value: string) => {
	const [, year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)?.map(Number) ?? [];
	const date = new Date(year, month - 1, day);
	return date.getMonth() === month - 1 && date.getDate() === day;
};

/** The day a valid date input stands for (checked only once there's a value). */
const day = () => v.check((value: string) => value === "" || isDay(value), "Enter a valid date");

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

/** An amount entered in euros (e.g. with `MoneyField`), stored in cents. */
export const cents = (required = "Enter an amount") =>
	v.pipe(
		// An empty number input arrives as undefined; say so rather than "expected number".
		v.number(required),
		v.minValue(0, "Can't be negative"),
		v.transform((euros) => Math.round(euros * 100)),
	);

/** A required date from `<input type="date">`, as a local date at the start of the day. */
export const date = (required = "Choose a date") =>
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
export const formatted = (required: string, pattern: RegExp, message: string) =>
	v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty(required),
		v.check((value) => value === "" || pattern.test(value), message),
	);

/** A required email address, stored in lower case. */
export const email = (required = "Enter an email address") =>
	v.pipe(formatted(required, v.EMAIL_REGEX, "Enter a valid email address"), v.toLowerCase());

/** A required phone number: digits with optional +, spaces, dots, dashes and brackets. */
export const phone = (required = "Enter a phone number") =>
	formatted(required, /^\+?[\d\s().-]{6,20}$/, "Enter a valid phone number");

/** The hours of labour on an order. */
export const laborHours = () =>
	v.pipe(v.number("Enter the hours"), v.minValue(0, "Can't be negative"));

/**
 * An order's material lines, for the order form and the engineer portal: a material and a
 * quantity each. Pieces are only counted whole; saving checks that against the material's unit.
 */
export const orderLines = () =>
	v.optional(
		v.array(
			v.object({
				materialId: id("Choose a material"),
				quantity: v.pipe(
					v.number("Enter a quantity"),
					v.gtValue(0, "More than 0"),
					v.check((quantity) => fitsUnit(quantity, "m"), "At most two decimals"),
				),
			}),
		),
		[],
	);
