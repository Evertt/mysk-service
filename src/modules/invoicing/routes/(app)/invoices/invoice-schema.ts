import * as v from "valibot";

import { formatNumber } from "#lib/format.ts";
import { m } from "#lib/paraglide/messages.js";
import { cents, date, id, text } from "#lib/schema.ts";

import { formatRate } from "../../../display.ts";

/** Days to pay: whole days, up to a year. */
const days = () =>
	v.pipe(
		v.number(m.invoices_days_required),
		v.integer(m.invoices_days_whole),
		v.minValue(0, m.validation_not_negative),
		v.maxValue(365, (issue) => m.invoices_days_max({ max: formatNumber(issue.requirement) })),
	);

/**
 * What to bill: completed orders and other modules' items (by reference), as checkboxes;
 * unchecked ones aren't submitted, so none checked means no field.
 */
export const billingFields = {
	orderIds: v.optional(v.array(id(m.invoices_orders_from_list)), []),
	items: v.optional(v.array(v.pipe(v.string(), v.nonEmpty())), []),
};

/** A new invoice: the customer and what to bill them for. */
export const newInvoiceFields = {
	customerId: id(m.invoices_customer_required),
	...billingFields,
};

/** A line typed in on a draft, e.g. call-out costs or a goodwill credit. */
export const lineFields = {
	description: text(m.invoices_line_description_required),
	quantity: v.pipe(
		v.number(m.validation_quantity_required),
		v.gtValue(0, m.validation_more_than_zero),
	),
	unitPrice: cents(m.invoices_unit_price_required),
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
		v.number(m.invoices_rate_required),
		v.minValue(0, m.validation_not_negative),
		v.maxValue(100, (issue) => m.invoices_rate_max({ max: formatRate(issue.requirement) })),
	),
	paymentTermDays: days(),
	billFrom: date(m.invoices_bill_from_required),
};
