/**
 * The server side of the invoicing module (see `#lib/modules.ts`): what a customer can be billed
 * for, an invoice with its totals (for its page and its PDF), and the module's hook into core (see
 * `#lib/server/modules.ts`). The rules themselves are in `#lib/components/invoicing/invoice.ts`.
 *
 * A customer can be billed for their completed orders, priced by `priceOrders()` like everywhere
 * else, and for what the tenant's other modules offer through `billableItems()` (e.g. a contract's
 * monthly fees). Either is billed while it's on an invoice that isn't void: on a draft, or sent or
 * paid. Issuing an invoice marks its orders invoiced; voiding a sent one puts them back.
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";

import {
	invoiceState,
	invoiceTotals,
	itemLine,
	type LineDraft,
	orderLines,
	today,
} from "#lib/components/invoicing/invoice.js";
// The module's queries, to refresh; they use this file in turn.
import { getOrderInvoice } from "#lib/components/invoicing/invoicing.remote.js";

import { db } from "./db/index.ts";
import {
	engineer,
	invoice,
	invoiceLine,
	invoicingSettings,
	order,
	orderLine,
} from "./db/schema.ts";
import { type BillableItem, billableItems, type ServerModule } from "./modules.ts";
import { priceOrders } from "./pricing.ts";
import { inTenant, requireMember } from "./session.ts";

export const invoicing: ServerModule = {
	orderSaved(number) {
		void getOrderInvoice(number).refresh();
	},
};

export type InvoicingSettings = typeof invoicingSettings.$inferSelect;

/**
 * The tenant's invoicing settings. Made with the defaults the first time they're needed, billing
 * other modules' items from the start of that month.
 */
export async function settingsOf(organizationId = requireMember().organizationId) {
	const where = eq(invoicingSettings.organizationId, organizationId);
	const found = await db.query.invoicingSettings.findFirst({ where });
	if (found) return found;
	const now = new Date();
	await db
		.insert(invoicingSettings)
		.values({ organizationId, billFrom: new Date(now.getFullYear(), now.getMonth(), 1) })
		.onConflictDoNothing();
	return (await db.query.invoicingSettings.findFirst({ where }))!;
}

/** A database transaction, as `db.transaction()` passes it. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A completed order that can be billed, with the lines it becomes. */
export interface BillableOrder {
	id: number;
	number: string;
	description: string;
	completedAt: Date | null;
	lines: LineDraft[];
	total: number;
}

/** The customer's completed orders that aren't on an invoice yet, oldest first, priced. */
async function billableOrders(customerId: number): Promise<BillableOrder[]> {
	const materials = db
		.select({
			orderId: orderLine.orderId,
			total: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`.as("total"),
		})
		.from(orderLine)
		.where(inTenant(orderLine))
		.groupBy(orderLine.orderId)
		.as("materials");

	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			description: order.description,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
			materials: sql<number>`coalesce(${materials.total}, 0)`,
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(
			and(
				inTenant(order),
				eq(order.customerId, customerId),
				eq(order.status, "completed"),
				notExists(
					db
						.select({ id: invoiceLine.id })
						.from(invoiceLine)
						.innerJoin(invoice, and(eq(invoiceLine.invoiceId, invoice.id), inTenant(invoice)))
						.where(
							and(
								inTenant(invoiceLine),
								eq(invoiceLine.orderId, order.id),
								ne(invoice.status, "void"),
							),
						),
				),
			),
		)
		.orderBy(asc(order.completedAt), asc(order.number));

	const prices = await priceOrders(rows);
	return rows.map((row, i) => ({
		id: row.id,
		number: row.number,
		description: row.description,
		completedAt: row.completedAt,
		lines: orderLines(row, prices[i]),
		total: prices[i].total,
	}));
}

/** Of `references`, the ones on the tenant's invoices that aren't void. */
async function billedReferences(references: string[]) {
	if (!references.length) return new Set<string>();
	const rows = await db
		.select({ source: invoiceLine.source })
		.from(invoiceLine)
		.innerJoin(invoice, and(eq(invoiceLine.invoiceId, invoice.id), inTenant(invoice)))
		.where(
			and(
				inTenant(invoiceLine),
				inArray(invoiceLine.source, references),
				ne(invoice.status, "void"),
			),
		);
	return new Set(rows.map((row) => row.source));
}

/** The modules' items for the customer that are due by `at` and not billed yet. */
async function unbilledItems(customerId: number, at: Date): Promise<BillableItem[]> {
	const settings = await settingsOf();
	const items = await billableItems(customerId, { from: settings.billFrom, until: today(at) });
	const done = await billedReferences(items.map((item) => item.reference));
	return items.filter((item) => !done.has(item.reference));
}

/** What the customer can be billed for now: completed orders and other modules' items. */
export async function billableFor(customerId: number, at = new Date()) {
	const [orders, items] = await Promise.all([
		billableOrders(customerId),
		unbilledItems(customerId, at),
	]);
	return { orders, items };
}

/**
 * The lines for the chosen orders and items of what the customer can be billed for. Lists what
 * was chosen but can't be billed (another tenant's or customer's, not completed, already billed,
 * or made up).
 */
export async function linesFor(customerId: number, orderIds: number[], references: string[]) {
	const { orders, items } = await billableFor(customerId);
	const chosenOrders = orders.filter((o) => orderIds.includes(o.id));
	const chosenItems = items.filter((item) => references.includes(item.reference));
	return {
		lines: [...chosenOrders.flatMap((o) => o.lines), ...chosenItems.map(itemLine)],
		unknownOrders: orderIds.filter((id) => !chosenOrders.some((o) => o.id === id)),
		unknownItems: references.filter((ref) => !chosenItems.some((item) => item.reference === ref)),
	};
}

/**
 * Inside a transaction: which of `lines` are billed meanwhile (by another request that got there
 * first), as order ids and references. Empty if none.
 */
export async function alreadyBilled(
	tx: Transaction,
	lines: Pick<LineDraft, "orderId" | "source">[],
) {
	const orderIds = [...new Set(lines.flatMap((line) => (line.orderId ? [line.orderId] : [])))];
	const sources = lines.flatMap((line) => (line.source ? [line.source] : []));
	if (!orderIds.length && !sources.length) return [];
	return tx
		.select({ orderId: invoiceLine.orderId, source: invoiceLine.source })
		.from(invoiceLine)
		.innerJoin(invoice, and(eq(invoiceLine.invoiceId, invoice.id), inTenant(invoice)))
		.where(
			and(
				inTenant(invoiceLine),
				ne(invoice.status, "void"),
				or(
					orderIds.length ? inArray(invoiceLine.orderId, orderIds) : undefined,
					sources.length ? inArray(invoiceLine.source, sources) : undefined,
				),
			),
		);
}

/** One of the tenant's invoices with its customer, lines and totals, or a 404. */
export async function loadInvoice(number: string, now = new Date()) {
	const found = await db.query.invoice.findFirst({
		where: and(eq(invoice.number, number), inTenant(invoice)),
		with: {
			customer: true,
			lines: {
				orderBy: (line, { asc }) => asc(line.id),
				with: { order: { columns: { number: true, status: true } } },
			},
		},
	});
	if (!found) error(404, `Invoice ${number} not found`);
	return {
		invoice: { ...found, state: invoiceState(found, now) },
		totals: invoiceTotals(found.lines, found.vatRate),
	};
}

/** The tenant's invoice by id (e.g. from a form), with its lines' orders; or a 404. */
export async function invoiceById(tx: Transaction, id: number) {
	const found = await tx.query.invoice.findFirst({
		where: and(eq(invoice.id, id), inTenant(invoice)),
		with: { lines: { columns: { id: true, orderId: true } } },
	});
	if (!found) error(404, "Invoice not found");
	return found;
}
