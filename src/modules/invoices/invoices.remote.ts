/**
 * The tenant's invoices: the list, one invoice, what a customer can be billed for and making a
 * draft; and what the module adds to core pages (see `slots` in `#lib/modules/manifests.ts`): the
 * invoice an order is on, and the receivables on the dashboard.
 */
import { redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { orderByNumber } from "#lib/orders/server/index.ts";
import { recordId } from "#lib/schema.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { newInvoiceFields } from "./form/invoice-schema.ts";
import { invoiceState, lineAmount } from "./invoice.ts";
import { form, query } from "./remote-functions.ts";
import { billableFor } from "./server/billable.ts";
import { listCreditNotes } from "./server/credit-notes.ts";
import { createDraft, invoiceSummaries, loadInvoice } from "./server/invoices.ts";
import { invoice, invoiceLine } from "./server/schema.ts";

/** The tenant's invoices with their customer, totals and credits, latest first. */
export const getInvoices = query(async () => invoiceSummaries());

/** One invoice with its customer, lines and totals, and the organization that sends it. */
export const getInvoice = query(v.string(), async (number) => {
	const tenant = currentTenant();
	return { ...(await loadInvoice(number)), organization: tenant.name };
});

/** The customers to choose from for a new invoice. */
export const getInvoiceCustomers = query(async () => {
	return db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.where(inTenant(customer))
		.orderBy(asc(customer.name));
});

/**
 * What a customer can be billed for now: their completed orders that aren't on an invoice, with
 * the lines they become, and other modules' items (e.g. contract fees).
 */
export const getBillable = query(recordId(), async (customerId) => {
	orNotFound(
		await db.query.customer.findFirst({
			columns: { id: true },
			where: idInTenant(customer, customerId),
		}),
		m.invoices_customer_not_found(),
	);

	const { orders, items } = await billableFor(customerId);
	return {
		orders: orders.map(({ lines, ...rest }) => ({
			...rest,
			lines: lines.map(({ description, detail, amount }) => ({ description, detail, amount })),
		})),
		items: items.map(({ reference, description, detail, quantity, unitPrice, date }) => ({
			reference,
			description,
			detail: detail ?? null,
			amount: lineAmount(quantity, unitPrice),
			date,
		})),
	};
});

/**
 * Creates a draft for a customer with the chosen orders and items, then shows it. It gets the
 * tenant's next number (see `invoiceNumbers`), and the tenant's payment term and VAT rate.
 */
export const createInvoice = form(v.object(newInvoiceFields), async (input) => {
	const created = await createDraft(input);
	void getInvoices().refresh();
	// The draft's page offers what's left to bill.
	void getBillable(input.customerId).refresh();
	redirect(303, `/invoices/${created.number}`);
});

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
	// What's left of each to pay, after its issued credit notes (a sent invoice credited in full is
	// paid by them, so none is left at nothing).
	const sent = (await invoiceSummaries(eq(invoice.status, "sent"))).map((row) => ({
		...row,
		total: row.remaining,
	}));
	const overdue = sent
		.filter((row) => row.state === "overdue")
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
		outstanding: { count: sent.length, total: sum(sent) },
		overdue: { count: overdue.length, total: sum(overdue) },
		/** As a positive amount. */
		refunds: { count: refunds.length, total: -sum(refunds) },
		drafts: drafts.n,
		/** The most overdue. */
		overdueInvoices: overdue.slice(0, OVERDUE_LISTED),
	};
});
