/**
 * Data for what the invoicing module adds to core pages (see `slots` in `#lib/modules/manifests.ts`): the
 * invoice an order is on, and the receivables on the dashboard.
 */
import { and, count, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { currentDay } from "#lib/dates.ts";
import { orderByNumber } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";

import { invoiceState, invoiceTotals, isOverdue } from "./invoice.ts";
import { query } from "./remote-functions.ts";
import { creditsByInvoice, creditSummary, listCreditNotes } from "./server/credit-notes.ts";
import { invoice, invoiceLine } from "./server/schema.ts";

/** How many overdue invoices the dashboard lists. */
const OVERDUE_LISTED = 6;

/**
 * The invoice an order is on (the latest that isn't void), or none; with what's needed to bill
 * it if it isn't on one: whether it's completed, and its customer.
 */
export const getOrderInvoice = query(v.string(), async (number) => {
	const found = await orderByNumber(number, (where) =>
		db.query.order.findMany({
			columns: { id: true, status: true },
			where,
			with: { customer: { columns: { code: true } } },
		}),
	);

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
	const today = currentDay();
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
	// What's left of each to pay, after its issued credit notes (a sent invoice credited in full is
	// paid by them, so none is left at nothing).
	const credits = await creditsByInvoice();
	const priced = sent.map(({ subtotal, ...row }) => ({
		...row,
		total: creditSummary(
			invoiceTotals([{ amount: subtotal }], row.vatRate),
			credits.get(row.id) ?? [],
			row.status,
		).remaining,
	}));
	const overdue = priced
		.filter((row) => isOverdue(row, today))
		.sort(
			(a, b) => Temporal.PlainDate.compare(a.dueOn!, b.dueOn!) || a.number.localeCompare(b.number),
		);

	const [drafts] = await db
		.select({ n: count() })
		.from(invoice)
		.where(and(inTenant(invoice), eq(invoice.status, "draft")));

	// What the tenant owes customers: sent credit notes that aren't offset against a sent invoice
	// (standalone ones and those against paid invoices), to refund. The card links to just these
	// on the credit notes' list (`?settlement=refund`).
	const refunds = (await listCreditNotes()).filter((credit) => credit.settlement === "refund");

	const sum = (rows: { total: number }[]) => rows.reduce((total, row) => total + row.total, 0);
	return {
		outstanding: { count: priced.length, total: sum(priced) },
		overdue: { count: overdue.length, total: sum(overdue) },
		/** As a positive amount. */
		refunds: { count: refunds.length, total: -sum(refunds) },
		drafts: drafts.n,
		/** The most overdue. */
		overdueInvoices: overdue.slice(0, OVERDUE_LISTED),
	};
});
