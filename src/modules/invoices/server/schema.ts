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

import { createdAt, day, moment, organizationId } from "#lib/server/db/columns.ts";
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
		issuedOn: day("issued_on"),
		/** The last day to pay, at local midnight; none while a draft. */
		dueOn: day("due_on"),
		paidOn: day("paid_on"),
		voidedAt: moment("voided_at"),
		notes: text("notes"),
		createdAt: createdAt(),
	},
	(table) => [
		// Unique within a tenant; another tenant may use the same number.
		uniqueIndex("invoice_organization_number").on(table.organizationId, table.number),
		uniqueIndex("invoice_organization_id").on(table.organizationId, table.id),
		// A customer's invoices; with the tenant, also the key to the customer.
		index("invoice_customer").on(table.customerId, table.organizationId),
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
		// With the tenant, also the keys to the invoice and the order.
		index("invoice_line_invoice").on(table.invoiceId, table.organizationId),
		index("invoice_line_order").on(table.orderId, table.organizationId),
		index("invoice_line_source").on(table.organizationId, table.source),
		// For the lines of the credit notes that credit it.
		uniqueIndex("invoice_line_organization_id").on(table.organizationId, table.id),
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

/**
 * A credit note: a document like an invoice that credits the customer, with a number series of its
 * own (`CN-2026-0001`). Either against one of its sent or paid invoices (`invoiceId`: some or all of
 * its lines, never more than is left of it after earlier credit notes, see `../credit-note.ts`) or
 * standalone (a goodwill credit, the partner programme's cash bonus). A table of its own rather than
 * a kind of invoice, so that what bills, what's billed and what's owed (`billable.ts`, the orders'
 * invoice card, the list's bulk actions) stay about invoices by construction; credit notes take part
 * where they change what's owed or earned: an invoice's remaining amount, the receivables, the
 * revenue (`../api/revenue.server.ts`). Its lines' amounts are negative, so its totals are. Its
 * statuses are an invoice's: a draft is issued (sent), then settled (`paid`: refunded, or offset
 * against the invoice it credits when that's paid) or voided.
 */
export const creditNote = sqliteTable(
	"credit_note",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		number: text("number").notNull(),
		customerId: integer("customer_id").notNull(),
		/** The invoice it credits; none for a standalone credit note. */
		invoiceId: integer("invoice_id"),
		status: text("status", { enum: invoiceStatuses }).notNull(),
		/** In percent: the credited invoice's, or the organization's when a standalone one is issued. */
		vatRate: real("vat_rate").notNull(),
		/** Why the customer is credited, e.g. "Returned part" or "Partner Bonus 2025"; printed on it. */
		reason: text("reason").notNull(),
		/** The day it was issued (sent); none while a draft. */
		issuedOn: day("issued_on"),
		/** The day it was settled: refunded, or offset against its invoice when that was paid. */
		settledOn: day("settled_on"),
		voidedAt: moment("voided_at"),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex("credit_note_organization_number").on(table.organizationId, table.number),
		uniqueIndex("credit_note_organization_id").on(table.organizationId, table.id),
		index("credit_note_customer").on(table.customerId, table.organizationId),
		index("credit_note_invoice").on(table.organizationId, table.invoiceId),
		foreignKey({
			columns: [table.organizationId, table.customerId],
			foreignColumns: [customer.organizationId, customer.id],
		}),
		// So an invoice with credit notes can't be deleted.
		foreignKey({
			columns: [table.organizationId, table.invoiceId],
			foreignColumns: [invoice.organizationId, invoice.id],
		}),
	],
);

/**
 * A line on a credit note: negative, as it takes off (one that takes back a discount is positive).
 * A line that credits a line of the invoice refers to it and keeps its order and source, so what's
 * credited counts where the line did (e.g. in the partner programme's revenue categories).
 */
export const creditNoteLine = sqliteTable(
	"credit_note_line",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		organizationId: organizationId(),
		creditNoteId: integer("credit_note_id").notNull(),
		description: text("description").notNull(),
		detail: text("detail"),
		quantity: real("quantity").notNull(),
		/** In cents; negative for what's credited. */
		unitPrice: integer("unit_price").notNull(),
		/** In cents: quantity × unit price. */
		amount: integer("amount").notNull(),
		/** The invoice's line it credits (some or all of); none on a standalone credit note. */
		invoiceLineId: integer("invoice_line_id"),
		orderId: integer("order_id"),
		/** The credited line's, or another module's reference (e.g. a partner's bonus year). */
		source: text("source"),
	},
	(table) => [
		index("credit_note_line_credit_note").on(table.creditNoteId, table.organizationId),
		index("credit_note_line_order").on(table.organizationId, table.orderId),
		index("credit_note_line_invoice_line").on(table.organizationId, table.invoiceLineId),
		foreignKey({
			columns: [table.organizationId, table.creditNoteId],
			foreignColumns: [creditNote.organizationId, creditNote.id],
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.organizationId, table.invoiceLineId],
			foreignColumns: [invoiceLine.organizationId, invoiceLine.id],
		}),
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
	billFrom: day("bill_from").notNull(),
});

export const invoiceRelations = relations(invoice, ({ one, many }) => ({
	customer: one(customer, {
		fields: [invoice.organizationId, invoice.customerId],
		references: [customer.organizationId, customer.id],
	}),
	lines: many(invoiceLine),
	creditNotes: many(creditNote),
}));

export const creditNoteRelations = relations(creditNote, ({ one, many }) => ({
	customer: one(customer, {
		fields: [creditNote.organizationId, creditNote.customerId],
		references: [customer.organizationId, customer.id],
	}),
	invoice: one(invoice, {
		fields: [creditNote.organizationId, creditNote.invoiceId],
		references: [invoice.organizationId, invoice.id],
	}),
	lines: many(creditNoteLine),
}));

export const creditNoteLineRelations = relations(creditNoteLine, ({ one }) => ({
	creditNote: one(creditNote, {
		fields: [creditNoteLine.organizationId, creditNoteLine.creditNoteId],
		references: [creditNote.organizationId, creditNote.id],
	}),
	order: one(order, {
		fields: [creditNoteLine.organizationId, creditNoteLine.orderId],
		references: [order.organizationId, order.id],
	}),
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
