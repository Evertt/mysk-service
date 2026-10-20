/**
 * The invoices themselves: making a draft from what can be billed (see `./billable.ts`) and
 * loading an invoice with its totals, for its page and its PDF. The rules are in `../invoice.ts`.
 */
import { and, eq } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { formatCents } from "#lib/i18n/index.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { idInTenant, inTenant, requireMember } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { customer } from "#lib/server/db/schema.ts";
import { nextNumber, type NumberTarget } from "#lib/server/numbering.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { invoiceState, invoiceTotals } from "../invoice.ts";
import { invoiceNumberFormat } from "../model.ts";
import { alreadyBilled, linesFor } from "./billable.ts";
import { creditSummary, creditsOf } from "./credit-notes.ts";
import { invoice, invoiceLine } from "./schema.ts";
import { settingsOf } from "./settings.ts";

/** Where invoice numbers are kept, for `nextNumber()`. */
const invoiceNumbers: NumberTarget = {
	format: invoiceNumberFormat,
	table: invoice,
	column: invoice.number,
};

/** How an invoice shows in the activity log. */
export const invoiceSubject = (found: { id: number; number: string }): Subject => ({
	type: "invoice",
	id: found.id,
	label: found.number,
});

/**
 * Makes a draft invoice for one of the tenant's customers with the chosen completed orders and
 * other modules' items, all of which must be billable (see `linesFor`). It gets the tenant's next
 * number (see `nextNumber`), payment term and VAT rate. Returns its id and number; refuses
 * (`Refused`) what's wrong, on the form's field, and if another request billed some of it
 * meanwhile. The new invoice form and the orders list's "Create invoice" share it.
 */
export async function createDraft(input: {
	customerId: number;
	orderIds: number[];
	items: string[];
}): Promise<{ id: number; number: string }> {
	const { organizationId } = requireMember();
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) throw new Refused({ path: ["customerId"], message: m.invoices_unknown_customer() });

	const { lines, unknownOrders, unknownItems } = await linesFor(
		input.customerId,
		input.orderIds,
		input.items,
	);
	if (unknownOrders.length) {
		throw new Refused({ path: ["orderIds"], message: m.invoices_only_billable_orders() });
	}
	if (unknownItems.length) {
		throw new Refused({ path: ["items"], message: m.invoices_only_billable_items() });
	}
	if (!lines.length) throw new Refused(m.invoices_choose_something());

	const settings = await settingsOf();
	return db.transaction(async (tx) => {
		if ((await alreadyBilled(tx, lines)).length) throw new Refused(m.invoices_billed_meanwhile());
		const number = await nextNumber(tx, invoiceNumbers);
		const [created] = await tx
			.insert(invoice)
			.values({
				organizationId,
				number,
				customerId: input.customerId,
				status: "draft",
				paymentTermDays: settings.paymentTermDays,
				vatRate: settings.vatRate,
			})
			.returning({ id: invoice.id });
		await insertRows(
			tx,
			invoiceLine,
			lines.map((line) => ({ ...line, organizationId, invoiceId: created.id })),
		);
		const total = lines.reduce((sum, line) => sum + line.amount, 0);
		await recordActivity(tx, {
			action: "created",
			subject: { type: "invoice", id: created.id, label: number },
			// In the language of whoever made it, like the lines.
			note: m.invoices_created_note({ count: lines.length, amount: formatCents(total) }),
		});
		return { id: created.id, number };
	});
}

/** One of the tenant's invoices with its customer, lines and totals, or a 404. */
export async function loadInvoice(number: string, today = currentDay()) {
	const found = orNotFound(
		await db.query.invoice.findFirst({
			where: and(eq(invoice.number, number), inTenant(invoice)),
			with: {
				customer: true,
				lines: {
					orderBy: (line, { asc }) => asc(line.id),
					with: { order: { columns: { number: true, status: true } } },
				},
			},
		}),
		m.invoices_number_not_found({ number }),
	);
	const totals = invoiceTotals(found.lines, found.vatRate);
	const credits = await creditsOf(db, [found.id]);
	return {
		invoice: { ...found, state: invoiceState(found, today) },
		totals,
		/** Its credit notes, oldest first, and what's left of it to pay and to credit. */
		credits: {
			notes: credits.map(({ id, number, status, issuedOn, settledOn, totals }) => ({
				id,
				number,
				status,
				issuedOn,
				settledOn,
				total: totals.total,
			})),
			...creditSummary(totals, credits, found.status),
		},
	};
}

/** The tenant's invoice by id (e.g. from a form), with its lines' orders; or a 404. */
export async function invoiceById(tx: Transaction, id: number) {
	return orNotFound(
		await tx.query.invoice.findFirst({
			where: idInTenant(invoice, id),
			with: { lines: { columns: { id: true, orderId: true } } },
		}),
		m.invoices_not_found(),
	);
}
