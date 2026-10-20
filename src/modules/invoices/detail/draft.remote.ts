/** Changing a draft invoice: its lines and its terms. */
import { error, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertBatches } from "#lib/server/db/parameters.ts";
import { Refused } from "#lib/server/refused.ts";

import { lineNote } from "../activity.ts";
import { billingFields, lineFields, termsFields } from "../form/invoice-schema.ts";
import { isEditable, lineAmount } from "../invoice.ts";
import { form } from "../remote-functions.ts";
import { alreadyBilled, linesFor } from "../server/billable.ts";
import { refreshInvoice } from "../server/invoice-refresh.ts";
import { invoiceById, invoiceSubject } from "../server/invoices.ts";
import { invoice, invoiceLine } from "../server/schema.ts";

/** Logs lines added to an invoice, against it. */
async function recordLines(
	tx: Transaction,
	found: { id: number; number: string },
	lines: { id: number; description: string; quantity: number; unitPrice: number; amount: number }[],
) {
	for (const line of lines) {
		await recordActivity(tx, {
			action: "created",
			subject: { type: "invoice_line", id: line.id, label: line.description },
			parent: invoiceSubject(found),
			note: lineNote(line),
		});
	}
}

/** The columns of a line the activity log needs. */
const loggedLine = {
	id: invoiceLine.id,
	description: invoiceLine.description,
	quantity: invoiceLine.quantity,
	unitPrice: invoiceLine.unitPrice,
	amount: invoiceLine.amount,
};

/** The tenant's draft by id, inside a transaction; refuses anything else. */
async function draftById(tx: Transaction, id: number) {
	const found = await invoiceById(tx, id);
	if (!isEditable(found.status))
		throw new Refused(m.invoices_not_editable({ number: found.number }));
	return found;
}

/** Adds more of the customer's orders and items to a draft. */
export const addToInvoice = form(
	v.object({ id: id(), ...billingFields }),
	async ({ id, orderIds, items }, issue) => {
		const { organizationId } = currentTenant();
		const found = await db.query.invoice.findFirst({
			columns: { customerId: true },
			where: idInTenant(invoice, id),
		});
		if (!found) error(404, m.invoices_not_found());

		const { lines, unknownOrders, unknownItems } = await linesFor(
			found.customerId,
			orderIds,
			items,
		);
		if (unknownOrders.length) invalid(issue.orderIds(m.invoices_only_billable_orders()));
		if (unknownItems.length) invalid(issue.items(m.invoices_only_billable_items()));
		if (!lines.length) throw new Refused(m.invoices_choose_to_add());

		const draft = await db.transaction(async (tx) => {
			const draft = await draftById(tx, id);
			if ((await alreadyBilled(tx, lines)).length) throw new Refused(m.invoices_billed_meanwhile());
			const rows = lines.map((line) => ({ ...line, organizationId, invoiceId: draft.id }));
			const added = [];
			for (const batch of insertBatches(invoiceLine, rows)) {
				added.push(...(await tx.insert(invoiceLine).values(batch).returning(loggedLine)));
			}
			await recordLines(tx, draft, added);
			return draft;
		});
		refreshInvoice(draft);
	},
);

/** Adds a line typed in by hand to a draft. */
export const addLine = form(v.object({ id: id(), ...lineFields }), async (input) => {
	const { organizationId } = currentTenant();
	const draft = await db.transaction(async (tx) => {
		const draft = await draftById(tx, input.id);
		const added = await tx
			.insert(invoiceLine)
			.values({
				organizationId,
				invoiceId: draft.id,
				description: input.description,
				quantity: input.quantity,
				unitPrice: input.unitPrice,
				amount: lineAmount(input.quantity, input.unitPrice),
			})
			.returning(loggedLine);
		await recordLines(tx, draft, added);
		return draft;
	});
	refreshInvoice(draft);
});

/** Removes a line from a draft; an order's lines (its price and adjustments) go together. */
export const removeLine = form(v.object({ id: id() }), async ({ id }) => {
	const draft = await db.transaction(async (tx) => {
		const line = await tx.query.invoiceLine.findFirst({
			columns: { id: true, invoiceId: true, orderId: true },
			where: idInTenant(invoiceLine, id),
		});
		if (!line) error(404, m.invoices_line_not_found());
		const draft = await draftById(tx, line.invoiceId);
		const removed = await tx
			.delete(invoiceLine)
			.where(
				and(
					inTenant(invoiceLine),
					eq(invoiceLine.invoiceId, draft.id),
					line.orderId ? eq(invoiceLine.orderId, line.orderId) : eq(invoiceLine.id, line.id),
				),
			)
			.returning(loggedLine);
		for (const gone of removed) {
			await recordActivity(tx, {
				action: "deleted",
				subject: { type: "invoice_line", id: gone.id, label: gone.description },
				parent: invoiceSubject(draft),
				note: lineNote(gone),
			});
		}
		return draft;
	});
	refreshInvoice(draft);
});

/** Changes a draft's payment term and notes. */
export const updateTerms = form(v.object({ id: id(), ...termsFields }), async (input) => {
	const draft = await db.transaction(async (tx) => {
		const draft = await draftById(tx, input.id);
		const terms = { paymentTermDays: input.paymentTermDays, notes: input.notes };
		await tx.update(invoice).set(terms).where(idInTenant(invoice, draft.id));
		const subject = invoiceSubject(draft);
		await recordActivity(tx, { action: "updated", subject, before: draft, after: terms });
		return draft;
	});
	refreshInvoice(draft);
});
