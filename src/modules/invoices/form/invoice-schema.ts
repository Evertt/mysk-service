import * as v from "valibot";

import { formatNumber } from "#lib/i18n/index.ts";
import { cents, date, id, numberIn, text, wholeIn } from "#lib/schema.ts";

import { formatRate } from "../display.ts";

/** Days to pay: whole days, up to a year. */
const days = () =>
	wholeIn({
		max: 365,
		message: m.invoices_days_required,
		fraction: m.invoices_days_whole,
		tooLow: m.validation_not_negative,
		tooHigh: () => m.invoices_days_max({ max: formatNumber(365) }),
	});

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
	quantity: numberIn({
		above: true,
		message: m.validation_quantity_required,
		tooLow: m.validation_more_than_zero,
	}),
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
	vatRate: numberIn({
		max: 100,
		message: m.invoices_rate_required,
		tooLow: m.validation_not_negative,
		tooHigh: () => m.invoices_rate_max({ max: formatRate(100) }),
	}),
	paymentTermDays: days(),
	billFrom: date(m.invoices_bill_from_required),
};
