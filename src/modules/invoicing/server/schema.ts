import { relations } from "drizzle-orm";
import {
	foreignKey,
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { createdAt, organizationId } from "#lib/server/db/columns.ts";
import { customer, order } from "#lib/server/db/schema.ts";

import { invoiceStatuses } from "../model.ts";

// These tables reference the core tables, never the other way round.

/**
 * A bill to a customer for completed orders and other modules' billable items (e.g. a service
 * contract's monthly fee). Its lines keep their amounts as they were when added, so it doesn't
 * change when prices do. A draft is editable; once sent, only its payment or voiding changes it.
 * Its subtotal, VAT and total follow from its lines and `vatRate`, see `../invoice.ts`.
 */
export const invoice = sqliteTable(
	"invoice",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		status: text("status", { enum: invoiceStatuses }).notNull(),
		/** The days the customer has to pay, from the day it's issued. */
		paymentTermDays: integer("payment_term_days").notNull(),
		/** In percent, e.g. 21: the organization's rate, fixed when the invoice is issued. */
		vatRate: real("vat_rate").notNull(),
		/** The day it was issued (sent), at local midnight; none while a draft. */
		issuedOn: integer("issued_on", { mode: "timestamp" }),
		/** The last day to pay, at local midnight; none while a draft. */
		dueOn: integer("due_on", { mode: "timestamp" }),
		paidOn: integer("paid_on", { mode: "timestamp" }),
		voidedAt: integer("voided_at", { mode: "timestamp" }),
		notes: text("notes"),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("invoice_organization_number").on(table.organizationId, table.number),
		uniqueIndex("invoice_organization_id").on(table.organizationId, table.id),
		index("invoice_customer").on(table.customerId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
	],
);

/**
 * A line on an invoice. Lines for an order (its price, and the modules' adjustments to it, e.g.
 * what a contract includes) refer to the order; lines for another module's billable item keep the
 * item's reference in `source`; manual lines have neither. An order or item counts as billed
 * while it's on an invoice that isn't void.
 */
export const invoiceLine = sqliteTable(
	"invoice_line",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		invoiceId: integer("invoice_id").notNull(),
		description: text("description").notNull(),
		/** A second line under the description, e.g. what a contract includes. */
		detail: text("detail"),
		quantity: real("quantity").notNull(),
		/** In cents; negative for a discount. */
		unitPrice: integer("unit_price").notNull(),
		/** In cents: quantity × unit price, as it was when the line was added. */
		amount: integer("amount").notNull(),
		orderId: integer("order_id"),
		/** Another module's billable item, e.g. `contracts:12:2026-10-01` for a month's fee. */
		source: text("source"),
	},
	(table) => [
		index("invoice_line_invoice").on(table.invoiceId),
		index("invoice_line_order").on(table.orderId),
		index("invoice_line_source").on(table.organizationId, table.source),
		foreignKey({
			columns: [table.organizationId, table.invoiceId],
			foreignColumns: [invoice.organizationId, invoice.id],
		}).onDelete("cascade"),
		// So an order on an invoice can't be deleted.
		foreignKey({
			columns: [table.organizationId, table.orderId],
			foreignColumns: [order.organizationId, order.id],
		}),
	],
);

/** A tenant's invoicing settings, created with the defaults when first needed. */
export const invoicingSettings = sqliteTable("invoicing_settings", {
	organizationId: organizationId().primaryKey(),
	/** In percent, e.g. 21. */
	vatRate: real("vat_rate").notNull().default(21),
	paymentTermDays: integer("payment_term_days").notNull().default(30),
	/**
	 * Other modules' items (e.g. contract fees) are billed from this day on: earlier ones were
	 * billed before the tenant invoiced through the app.
	 */
	billFrom: integer("bill_from", { mode: "timestamp" }).notNull(),
});

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
	customer: one(customer, {
		fields: [invoice.organizationId, invoice.customerId],
		references: [customer.organizationId, customer.id],
	}),
	lines: many(invoiceLine),
}));

export const invoiceLineRelations = relations(invoiceLine, ({ one }) => ({
	invoice: one(invoice, {
		fields: [invoiceLine.organizationId, invoiceLine.invoiceId],
		references: [invoice.organizationId, invoice.id],
	}),
	order: one(order, {
		fields: [invoiceLine.organizationId, invoiceLine.orderId],
		references: [order.organizationId, order.id],
	}),
}));
