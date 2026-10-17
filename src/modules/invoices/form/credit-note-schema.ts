import * as v from "valibot";

import { cents, id, text } from "#lib/schema.ts";

/** Why the customer is credited, printed on the credit note. */
const reason = () => v.pipe(text(m.invoices_credit_reason_required), v.maxLength(200));

/**
 * Crediting an invoice: why, and per line of it whether to credit it and by how much (in euros,
 * up to what's left of it). Unchecked lines aren't credited, whatever their amount says.
 */
export const creditInvoiceFields = {
	invoiceId: id(),
	reason: reason(),
	lines: v.optional(
		v.array(
			v.object({
				lineId: id(),
				credit: v.optional(v.boolean(), false),
				amount: v.optional(cents(m.invoices_credit_amount_required), 0),
			}),
		),
		[],
	),
};

/** A standalone credit note: for whom, why, and the first line (more can go on its draft). */
export const standaloneCreditFields = {
	customerId: id(m.invoices_customer_required),
	reason: reason(),
	description: text(m.invoices_line_description_required),
	amount: v.pipe(
		cents(m.invoices_credit_amount_required),
		v.minValue(1, m.validation_more_than_zero),
	),
};

/** A draft credit note's reason. */
export const reasonFields = { reason: reason() };
