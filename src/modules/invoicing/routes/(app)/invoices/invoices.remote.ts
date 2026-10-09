import { form, query } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { m } from "#lib/paraglide/messages.js";
import { idInTenant, inTenant, requireModule, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { refuse } from "#lib/server/forms.ts";

import { invoiceState, invoiceTotals, lineAmount } from "../../../invoice.ts";
import { billableFor } from "../../../server/billable.ts";
import { createDraft, loadInvoice } from "../../../server/invoices.ts";
import { invoice, invoiceLine } from "../../../server/schema.ts";
import { newInvoiceFields } from "./invoice-schema.ts";

/** The tenant's invoices with their customer and totals, latest first. */
export const getInvoices = query(async () => {
	requireModule("invoicing");
	const lines = db
		.select({
			invoiceId: invoiceLine.invoiceId,
			count: count().as("line_count"),
			subtotal: sql<number>`sum(${invoiceLine.amount})`.as("subtotal"),
		})
		.from(invoiceLine)
		.where(inTenant(invoiceLine))
		.groupBy(invoiceLine.invoiceId)
		.as("lines");

	const rows = await db
		.select({
			id: invoice.id,
			number: invoice.number,
			status: invoice.status,
			issuedOn: invoice.issuedOn,
			dueOn: invoice.dueOn,
			paidOn: invoice.paidOn,
			vatRate: invoice.vatRate,
			createdAt: invoice.createdAt,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			lineCount: sql<number>`coalesce(${lines.count}, 0)`,
			subtotal: sql<number>`coalesce(${lines.subtotal}, 0)`,
		})
		.from(invoice)
		.innerJoin(...tenantJoin(customer, invoice.customerId))
		.leftJoin(lines, eq(lines.invoiceId, invoice.id))
		.where(inTenant(invoice))
		.orderBy(desc(invoice.id));

	const now = new Date();
	return rows.map(({ subtotal, ...row }) => ({
		...row,
		state: invoiceState(row, now),
		...invoiceTotals([{ amount: subtotal }], row.vatRate),
	}));
});

/** One invoice with its customer, lines and totals, and the organization that sends it. */
export const getInvoice = query(v.string(), async (number) => {
	const tenant = requireModule("invoicing");
	return { ...(await loadInvoice(number)), organization: tenant.name };
});

/** The customers to choose from for a new invoice. */
export const getInvoiceCustomers = query(async () => {
	requireModule("invoicing");
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
export const getBillable = query(v.number(), async (customerId) => {
	requireModule("invoicing");
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, customerId),
	});
	if (!owner) error(404, m.invoices_customer_not_found());

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
export const createInvoice = form(v.object(newInvoiceFields), async (input, issue) => {
	requireModule("invoicing");
	const created = await createDraft(input);
	if ("problem" in created) return refuse(issue, [created.problem]);
	void getInvoices().refresh();
	// The draft's page offers what's left to bill.
	void getBillable(input.customerId).refresh();
	redirect(303, `/invoices/${created.number}`);
});
