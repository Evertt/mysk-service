/**
 * What a customer can be billed for: their completed orders, priced by `priceOrders()` like
 * everywhere else, and what the tenant's other modules offer through `invoicing.billableItems`
 * (`../api/extensions.ts`, e.g. a contract's monthly fees). Either is billed while it's on an
 * invoice that isn't void: on a draft, or sent or paid. Issuing an invoice marks its orders
 * invoiced; voiding a sent one puts them back. Making the invoice is in `./invoices.ts`, the rules
 * in `../invoice.ts`.
 */
import { and, asc, eq, inArray, ne, notExists, or, sql } from "drizzle-orm";

import type { BillableItem, BillingPeriod } from "#lib/billing.ts";
import { materialsPerOrder, priceOrders } from "#lib/orders/server";
import { inTenant, tenantJoin } from "#lib/server/auth";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

import { billableItems } from "../api/extensions.ts";
import { itemLine, type LineDraft, orderLines, today } from "../invoice.ts";
import { invoice, invoiceLine } from "./schema.ts";
import { settingsOf } from "./settings.ts";

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
	const materials = materialsPerOrder();

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
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				eq(order.customerId, customerId),
				eq(order.status, "completed"),
				notExists(
					db
						.select({ id: invoiceLine.id })
						.from(invoiceLine)
						.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
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
		lines: orderLines(row, prices[i], m.invoices_line_materials_labour()),
		total: prices[i].total,
	}));
}

/** Of `references`, the ones on the tenant's invoices that aren't void. */
async function billedReferences(references: string[]) {
	if (!references.length) return new Set<string>();
	const rows = await db
		.select({ source: invoiceLine.source })
		.from(invoiceLine)
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
		.where(
			and(
				inTenant(invoiceLine),
				inArray(invoiceLine.source, references),
				ne(invoice.status, "void"),
			),
		);
	return new Set(rows.map((row) => row.source));
}

/**
 * What the tenant's modules offer the customer for in `period`, by date: the one place
 * `invoicing.billableItems` is asked.
 */
export async function offeredItems(
	customerId: number,
	period: BillingPeriod,
	enabled?: readonly string[],
): Promise<BillableItem[]> {
	const answers = await collect(billableItems, { customerId, period }, enabled);
	return answers.flat().sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** The modules' items for the customer that are due by `at` and not billed yet. */
async function unbilledItems(customerId: number, at: Date): Promise<BillableItem[]> {
	const settings = await settingsOf();
	const items = await offeredItems(customerId, { from: settings.billFrom, until: today(at) });
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
		.innerJoin(...tenantJoin(invoice, invoiceLine.invoiceId))
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
