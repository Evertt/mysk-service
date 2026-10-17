/**
 * The invoicing module's revenue, for the modules that require it (the partner programme): the
 * lines of the tenant's paid invoices, excluding VAT (a line's amount is), by the day the invoice
 * was paid. Voided invoices, drafts and invoices still to be paid aren't in it. Server-only.
 */
import { and, eq, gte, lte } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { invoice, invoiceLine } from "../server/schema.ts";

/** Which paid invoices: paid from and until which days (both inclusive), of which customers. */
export interface PaidPeriod {
	from: Temporal.PlainDate;
	until: Temporal.PlainDate;
	/** All of the tenant's customers when left out. */
	customerIds?: readonly number[];
}

/**
 * The lines of the tenant's invoices paid in the period: the customer, the order the line is for
 * (none for another module's item, whose reference is its `source`, or a line typed in) and the
 * amount in cents. A query: await it for the rows, or use it in SQL as a subquery (`.as(name)`).
 */
export function paidInvoiceLines({ from, until, customerIds }: PaidPeriod) {
	return db
		.select({
			customerId: invoice.customerId,
			invoiceId: invoice.id,
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
		)
		.$dynamic();
}
