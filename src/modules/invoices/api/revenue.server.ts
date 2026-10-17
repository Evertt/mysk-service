/**
 * The invoicing module's revenue, for the modules that require it (the partner programme): the
 * lines of the tenant's paid invoices, by the day the invoice was paid, less the lines of its
 * settled credit notes (negative), by the day each was settled; excluding VAT (a line's amount is).
 * Voided invoices and credit notes, drafts and what's still to be paid or settled aren't in it.
 * Server-only.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { creditNote, creditNoteLine, invoice, invoiceLine } from "../server/schema.ts";

/** Which paid invoices and settled credit notes: from and until which days (both inclusive), of which customers. */
export interface PaidPeriod {
	from: Temporal.PlainDate;
	until: Temporal.PlainDate;
	/** All of the tenant's customers when left out. */
	customerIds?: readonly number[];
}

/**
 * The lines of the tenant's invoices paid in the period and of its credit notes settled in it: the
 * customer, the invoice (a credit note's: the one it credits, none if standalone), the credit note
 * (none for an invoice's line), the day, the order the line is for (a credit note's line keeps the
 * one of the line it credits; none for another module's item, whose reference is its `source`, or
 * a line typed in) and the amount in cents, negative for what's credited. A query: await it for the
 * rows, or use it in SQL as a subquery (`.as(name)`).
 */
export function paidInvoiceLines({ from, until, customerIds }: PaidPeriod) {
	const invoiced = db
		.select({
			customerId: invoice.customerId,
			invoiceId: sql<number | null>`${invoice.id}`.as("invoice_id"),
			creditNoteId: sql<number | null>`null`.as("credit_note_id"),
			paidOn: invoice.paidOn,
			orderId: invoiceLine.orderId,
			source: invoiceLine.source,
			amount: invoiceLine.amount,
		})
		.from(invoiceLine)
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
		.where(
			and(
				inTenant(invoiceLine),
				eq(invoice.status, "paid"),
				gte(invoice.paidOn, from),
				lte(invoice.paidOn, until),
				customerIds ? inList(invoice.customerId, [...customerIds]) : undefined,
			),
		);
	const credited = db
		.select({
			customerId: creditNote.customerId,
			invoiceId: sql<number | null>`${creditNote.invoiceId}`.as("invoice_id"),
			creditNoteId: sql<number | null>`${creditNote.id}`.as("credit_note_id"),
			paidOn: creditNote.settledOn,
			orderId: creditNoteLine.orderId,
			source: creditNoteLine.source,
			amount: creditNoteLine.amount,
		})
		.from(creditNoteLine)
		.innerJoin(...tenantJoin(creditNote, creditNoteLine.creditNoteId))
		.where(
			and(
				inTenant(creditNoteLine),
				eq(creditNote.status, "paid"),
				gte(creditNote.settledOn, from),
				lte(creditNote.settledOn, until),
				customerIds ? inList(creditNote.customerId, [...customerIds]) : undefined,
			),
		);
	return invoiced.unionAll(credited).$dynamic();
}
