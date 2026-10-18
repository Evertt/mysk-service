/** Issuing, paying and voiding invoices. */
import { invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { can } from "#lib/orders/index.ts";
import { transitionOrder } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, idsInTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";

import { holdsCredit } from "./credit-note.ts";
import { getCreditNotes } from "./credit-notes.remote.ts";
import { canChange } from "./invoice.ts";
import { getInvoices } from "./invoices.remote.ts";
import type { InvoiceStatus } from "./model.ts";
import { command, form } from "./remote-functions.ts";
import { creditsOf } from "./server/credit-notes.ts";
import { refreshCreditNote, refreshInvoice } from "./server/invoice-refresh.ts";
import { invoiceById, invoiceSubject } from "./server/invoices.ts";
import { invoice } from "./server/schema.ts";
import { settingsOf } from "./server/settings.ts";
import { recordPayment } from "./server/settlement.ts";

/** What an invoice is, as in "… is a draft". */
const statusLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_is_draft,
	sent: m.invoices_is_sent,
	paid: m.invoices_is_paid,
	void: m.invoices_is_void,
};

/** What can't be done to it, as in "… can't be issued". */
const changeLabel: Record<InvoiceStatus, () => string> = {
	draft: m.invoices_change_draft,
	sent: m.invoices_change_sent,
	paid: m.invoices_change_paid,
	void: m.invoices_change_void,
};

/** The tenant's invoice by id, if it can go to `to`; refuses otherwise. */
async function changing(tx: Transaction, id: number, to: InvoiceStatus) {
	const found = await invoiceById(tx, id);
	if (!canChange(found.status, to)) {
		invalid(
			m.invoices_cannot_change({
				number: found.number,
				status: statusLabel[found.status](),
				change: changeLabel[to](),
			}),
		);
	}
	return found;
}

/** What an invoice's orders say about their change of status. */
const invoiceNote = (found: { number: string }) =>
	m.invoices_invoice_number({ number: found.number });

const orderIdsOf = (found: { lines: { orderId: number | null }[] }) => [
	...new Set(found.lines.flatMap((line) => (line.orderId ? [line.orderId] : []))),
];

/**
 * Issues (sends) a draft: it gets today's date, its due date and the tenant's current VAT rate,
 * and its orders become invoiced. Its lines keep the amounts they have.
 */
export const issueInvoice = form(v.object({ id: id() }), async ({ id }) => {
	const { organizationId } = currentTenant();
	const settings = await settingsOf(organizationId);
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "sent");
		if (!found.lines.length) invalid(m.invoices_add_before_issuing());

		const orderIds = orderIdsOf(found);
		if (orderIds.length) {
			const orders = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(idsInTenant(order, orderIds));
			const undone = orders.filter((o) => !can("invoice", o.status)).map((o) => o.number);
			if (undone.length) {
				invalid(
					m.invoices_orders_not_completed({ count: undone.length, orders: undone.join(", ") }),
				);
			}
			await transitionOrder(tx, { verb: "invoice", orders, note: invoiceNote(found) });
		}

		// Today, the user's.
		const issuedOn = Temporal.Now.plainDateISO(getTimeZone());
		const issued = {
			status: "sent" as const,
			issuedOn,
			dueOn: issuedOn.add({ days: found.paymentTermDays }),
			vatRate: settings.vatRate,
		};
		await tx.update(invoice).set(issued).where(idInTenant(invoice, found.id));
		// The status follows from the verb.
		const subject = invoiceSubject(found);
		const ignore = ["status", "issuedOn"];
		await recordActivity(tx, { action: "issued", subject, before: found, after: issued, ignore });
		return found;
	});
	refreshInvoice(found);
});

/**
 * Records that one of the tenant's sent invoices was paid, today, settling its sent credit notes
 * (`recordPayment()`); refuses any other. The invoice's page and the list's bulk action share it.
 */
function payInvoice(id: number) {
	return db.transaction(async (tx) => {
		const found = await changing(tx, id, "paid");
		const settled = await recordPayment(tx, found, Temporal.Now.plainDateISO(getTimeZone()));
		return { ...found, settled };
	});
}

/** Records that a sent invoice was paid, today. */
export const markPaid = form(v.object({ id: id() }), async ({ id }) => {
	const paid = await payInvoice(id);
	refreshInvoice(paid);
	for (const credit of paid.settled) refreshCreditNote(credit);
});

/** Marks the selected invoices paid, today: the sent ones (see `canChange`). */
export const bulkMarkPaid = command(idsTarget, async (target) => {
	const result = await bulkChange(target, {
		table: invoice,
		label: invoice.number,
		change: (each) => payInvoice(each.id),
	});
	void getInvoices().refresh();
	void getCreditNotes().refresh();
	return result;
});

/**
 * Voids a draft or a sent invoice. It keeps its number and lines, but no longer bills them: its
 * orders go back to completed and its items can be billed again.
 */
export const voidInvoice = form(v.object({ id: id() }), async ({ id }) => {
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "void");
		const credits = (await creditsOf(tx, [found.id])).filter((each) => holdsCredit(each.status));
		if (credits.length) {
			invalid(
				m.invoices_void_has_credit_notes({
					number: found.number,
					credits: credits.map((each) => each.number).join(", "),
				}),
			);
		}
		const orderIds = orderIdsOf(found);
		if (found.status === "sent" && orderIds.length) {
			// Only those still invoiced go back.
			const invoiced = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(and(idsInTenant(order, orderIds), eq(order.status, "invoiced")));
			await transitionOrder(tx, { verb: "uninvoice", orders: invoiced, note: invoiceNote(found) });
		}
		await tx
			.update(invoice)
			.set({ status: "void", voidedAt: Temporal.Now.instant() })
			.where(idInTenant(invoice, found.id));
		await recordActivity(tx, { action: "voided", subject: invoiceSubject(found) });
		return found;
	});
	refreshInvoice(found);
});
