/**
 * Valibot building blocks for remote form schemas. Form fields arrive as strings, so ids and
 * optional values are transformed here; number inputs (`.as("number")`) arrive as numbers.
 */
import * as v from "valibot";

/** A required id, e.g. from a select. */
export const id = (message = "Choose one") =>
	v.pipe(v.string(), v.nonEmpty(message), v.transform(Number), v.integer(message));

/** An optional id; the empty option means "none". */
export const optionalId = () =>
	v.pipe(
		v.string(),
		v.transform((value) => (value === "" ? null : Number(value))),
	);

/** A required, trimmed text. */
export const text = (message = "Required") => v.pipe(v.string(), v.trim(), v.nonEmpty(message));

/** An optional date from `<input type="date">`, as a local date at the start of the day. */
export const optionalDate = () =>
	v.pipe(
		v.string(),
		v.transform((value) => (value ? new Date(`${value}T00:00`) : null)),
	);

/** A date for `<input type="date">`, e.g. as the initial value of an edit form. */
export const toDateInput = (date: Date | null | undefined) =>
	date
		? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
		: "";

/** An amount entered in euros (e.g. with `MoneyField`), stored in cents. */
export const cents = (message = "Can't be negative") =>
	v.pipe(
		v.number(),
		v.minValue(0, message),
		v.transform((euros) => Math.round(euros * 100)),
	);
