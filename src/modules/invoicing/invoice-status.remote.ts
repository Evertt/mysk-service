/** Issuing, paying and voiding invoices. */
import { invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { setOrdersStatus } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, idsInTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";

import { canChange, dueDate, today } from "./invoice.ts";
import { getInvoices } from "./invoices.remote.ts";
import type { InvoiceStatus } from "./model.ts";
import { command, form } from "./remote-functions.ts";
import { refreshInvoice } from "./server/invoice-refresh.ts";
import { invoiceById, invoiceSubject } from "./server/invoices.ts";
import { invoice } from "./server/schema.ts";
import { settingsOf } from "./server/settings.ts";

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
			const undone = orders.filter((o) => o.status !== "completed").map((o) => o.number);
			if (undone.length) {
				invalid(
					m.invoices_orders_not_completed({ count: undone.length, orders: undone.join(", ") }),
				);
			}
			await setOrdersStatus(tx, orders, "invoiced", invoiceNote(found));
		}

		const issuedOn = today();
		const issued = {
			status: "sent" as const,
			issuedOn,
			dueOn: dueDate(issuedOn, found.paymentTermDays),
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
 * Records that one of the tenant's sent invoices was paid, today; refuses any other. The invoice's
 * page and the list's bulk action share it.
 */
function payInvoice(id: number) {
	return db.transaction(async (tx) => {
		const found = await changing(tx, id, "paid");
		await tx
			.update(invoice)
			.set({ status: "paid", paidOn: today() })
			.where(idInTenant(invoice, found.id));
		await recordActivity(tx, { action: "paid", subject: invoiceSubject(found) });
		return found;
	});
}

/** Records that a sent invoice was paid, today. */
export const markPaid = form(v.object({ id: id() }), async ({ id }) => {
	refreshInvoice(await payInvoice(id));
});

/** Marks the selected invoices paid, today: the sent ones (see `canChange`). */
export const bulkMarkPaid = command(idsTarget, async (target) => {
	const result = await bulkChange(target, {
		table: invoice,
		label: invoice.number,
		change: (each) => payInvoice(each.id),
	});
	void getInvoices().refresh();
	return result;
});

/**
 * Voids a draft or a sent invoice. It keeps its number and lines, but no longer bills them: its
 * orders go back to completed and its items can be billed again.
 */
export const voidInvoice = form(v.object({ id: id() }), async ({ id }) => {
	const found = await db.transaction(async (tx) => {
		const found = await changing(tx, id, "void");
		const orderIds = orderIdsOf(found);
		if (found.status === "sent" && orderIds.length) {
			// Only those still invoiced go back.
			const invoiced = await tx
				.select({ id: order.id, number: order.number, status: order.status })
				.from(order)
				.where(and(idsInTenant(order, orderIds), eq(order.status, "invoiced")));
			await setOrdersStatus(tx, invoiced, "completed", invoiceNote(found));
		}
		await tx
			.update(invoice)
			.set({ status: "void", voidedAt: new Date() })
			.where(idInTenant(invoice, found.id));
		await recordActivity(tx, { action: "voided", subject: invoiceSubject(found) });
		return found;
	});
	refreshInvoice(found);
});
