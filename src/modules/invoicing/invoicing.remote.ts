/**
 * Data for what the invoicing module adds to core pages (see `slots` in `#lib/modules/manifests.ts`): the
 * invoice an order is on, and the receivables on the dashboard.
 */
import { error } from "@sveltejs/kit";
import { and, count, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { inTenant, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { customer, order } from "#lib/server/db/schema.ts";

import { invoiceState, invoiceTotals, isOverdue } from "./invoice.ts";
import { query } from "./remote-functions.ts";
import { invoice, invoiceLine } from "./server/schema.ts";

/** How many overdue invoices the dashboard lists. */
const OVERDUE_LISTED = 6;

/**
 * The invoice an order is on (the latest that isn't void), or none; with what's needed to bill
 * it if it isn't on one: whether it's completed, and its customer.
 */
export const getOrderInvoice = query(v.string(), async (number) => {
	const found = await db.query.order.findFirst({
		columns: { id: true, status: true },
		where: and(eq(order.number, number), inTenant(order)),
		with: { customer: { columns: { code: true } } },
	});
	if (!found) error(404, m.invoices_order_not_found({ number }));

	const invoices = await db
		.selectDistinct({
			id: invoice.id,
			number: invoice.number,
			status: invoice.status,
			issuedOn: invoice.issuedOn,
			dueOn: invoice.dueOn,
		})
		.from(invoiceLine)
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
		.where(and(inTenant(invoiceLine), eq(invoiceLine.orderId, found.id)))
		.orderBy(desc(invoice.id));
	const current = invoices.find((row) => row.status !== "void");

	return {
		status: found.status,
		customerCode: found.customer.code,
		invoice: current ? { ...current, state: invoiceState(current) } : null,
		/** Earlier invoices that were voided, latest first. */
		voided: invoices.filter((row) => row.status === "void").map((row) => row.number),
	};
});

/**
 * For the dashboard: what customers owe on sent invoices, how much of it is overdue (most overdue
 * first), and how many drafts wait to be issued.
 */
export const getReceivables = query(async () => {
	const now = new Date();
	const subtotals = db
		.select({
			invoiceId: invoiceLine.invoiceId,
			subtotal: sql<number>`sum(${invoiceLine.amount})`.as("subtotal"),
		})
		.from(invoiceLine)
		.where(inTenant(invoiceLine))
		.groupBy(invoiceLine.invoiceId)
		.as("subtotals");

	const sent = await db
		.select({
			id: invoice.id,
			number: invoice.number,
			status: invoice.status,
			dueOn: invoice.dueOn,
			vatRate: invoice.vatRate,
			subtotal: sql<number>`coalesce(${subtotals.subtotal}, 0)`,
			customer: { code: customer.code, name: customer.name },
		})
		.from(invoice)
		.innerJoin(...tenantJoin(customer, invoice.customerId))
		.leftJoin(subtotals, eq(subtotals.invoiceId, invoice.id))
		.where(and(inTenant(invoice), eq(invoice.status, "sent")));
	const priced = sent.map(({ subtotal, ...row }) => ({
		...row,
		total: invoiceTotals([{ amount: subtotal }], row.vatRate).total,
	}));
	const overdue = priced
		.filter((row) => isOverdue(row, now))
		.sort((a, b) => a.dueOn!.getTime() - b.dueOn!.getTime() || a.number.localeCompare(b.number));

	const [drafts] = await db
		.select({ n: count() })
		.from(invoice)
		.where(and(inTenant(invoice), eq(invoice.status, "draft")));

	const sum = (rows: { total: number }[]) => rows.reduce((total, row) => total + row.total, 0);
	return {
		outstanding: { count: priced.length, total: sum(priced) },
		overdue: { count: overdue.length, total: sum(overdue) },
		drafts: drafts.n,
		/** The most overdue. */
		overdueInvoices: overdue.slice(0, OVERDUE_LISTED),
	};
});
