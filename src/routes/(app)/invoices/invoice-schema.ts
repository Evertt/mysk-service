import * as v from "valibot";

import { cents, date, id, text } from "#lib/schema.js";

/** Days to pay: whole days, up to a year. */
const days = () =>
	v.pipe(
		v.number("Enter a number of days"),
		v.integer("Whole days only"),
		v.minValue(0, "Can't be negative"),
		v.maxValue(365, "At most 365 days"),
	);

/**
 * What to bill: completed orders and other modules' items (by reference), as checkboxes;
 * unchecked ones aren't submitted, so none checked means no field.
 */
export const billingFields = {
	orderIds: v.optional(v.array(id("Choose orders from the list")), []),
	items: v.optional(v.array(v.pipe(v.string(), v.nonEmpty())), []),
};

/** A new invoice: the customer and what to bill them for. */
export const newInvoiceFields = {
	customerId: id("Choose a customer"),
	...billingFields,
};

/** A line typed in on a draft, e.g. call-out costs or a goodwill credit. */
export const lineFields = {
	description: text("Describe what's billed"),
	quantity: v.pipe(v.number("Enter a quantity"), v.gtValue(0, "More than 0")),
	unitPrice: cents("Enter a unit price"),
};

/** A draft's terms. */
export const termsFields = {
	paymentTermDays: days(),
	notes: v.pipe(
		v.string(),
		v.trim(),
		v.transform((value) => value || null),
	),
};

/** The organization's invoicing settings. */
export const settingsFields = {
	vatRate: v.pipe(
		v.number("Enter a rate"),
		v.minValue(0, "Can't be negative"),
		v.maxValue(100, "At most 100%"),
	),
	paymentTermDays: days(),
	billFrom: date("Choose a day"),
};
