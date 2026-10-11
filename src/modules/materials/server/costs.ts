/**
 * What orders' materials cost: the materials module's answer to `orders.costs` (see
 * `#lib/orders/extensions.ts`), which `priceOrders()` adds to every order's price.
 */
import { and, asc, inArray, sql, type SQLWrapper } from "drizzle-orm";

import type { OrderCost, OrderFacts } from "#lib/orders/extensions.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { formatQuantity } from "../display.ts";
import { lineTotal } from "../model.ts";
import { material, orderLine } from "./schema.ts";

/**
 * An order line's total in cents, in SQL: the twin of `lineTotal()` in `#lib/models.ts`, which
 * rounds the same way. To add the lines up, wrap it in `sum()` in a `sql` template.
 */
export const lineTotalSql = (line: { quantity: SQLWrapper; unitPrice: SQLWrapper } = orderLine) =>
	sql<number>`round(${line.quantity} * ${line.unitPrice})`;

/** Ids in batches small enough for SQLite's limit on bound parameters. */
const CHUNK = 500;

/** Runs `query` for each batch of `ids`, and puts the rows together. */
async function inChunks<T>(ids: number[], query: (chunk: number[]) => Promise<T[]>) {
	const rows: T[] = [];
	for (let i = 0; i < ids.length; i += CHUNK) rows.push(...(await query(ids.slice(i, i + CHUNK))));
	return rows;
}

/** The current tenant's order lines added up per order, of the orders with these ids. */
const totalsOf = (ids: number[]) =>
	inChunks(ids, (chunk) =>
		db
			.select({ orderId: orderLine.orderId, total: sql<number>`sum(${lineTotalSql()})` })
			.from(orderLine)
			.where(and(inTenant(orderLine), inArray(orderLine.orderId, chunk)))
			.groupBy(orderLine.orderId),
	);

/** The current tenant's order lines of the orders with these ids, with their materials. */
const linesOf = (ids: number[]) =>
	inChunks(ids, (chunk) =>
		db
			.select({
				id: orderLine.id,
				orderId: orderLine.orderId,
				materialId: orderLine.materialId,
				quantity: orderLine.quantity,
				unitPrice: orderLine.unitPrice,
				sku: material.sku,
				name: material.name,
				unit: material.unit,
			})
			.from(orderLine)
			.innerJoin(...tenantJoin(material, orderLine.materialId))
			.where(and(inTenant(orderLine), inArray(orderLine.orderId, chunk)))
			.orderBy(asc(orderLine.id)),
	);

/**
 * The materials of each of `orders` as a cost: their lines' total (nothing for an order without
 * lines), and with `items` the lines themselves, linking to their materials.
 */
export async function materialCosts({
	orders,
	items,
}: {
	orders: OrderFacts[];
	items: boolean;
}): Promise<Map<number, OrderCost>> {
	const ids = orders.map((order) => order.id);
	const [totals, lines] = await Promise.all([totalsOf(ids), items ? linesOf(ids) : []]);
	const totalOf = new Map(totals.map((row) => [row.orderId, row.total]));
	const linesByOrder = Map.groupBy(lines, (line) => line.orderId);
	return new Map(
		ids.map((id) => {
			const cost: OrderCost = { label: m.materials_cost_label(), amount: totalOf.get(id) ?? 0 };
			if (items) {
				cost.empty = m.materials_order_no_lines();
				cost.items = (linesByOrder.get(id) ?? []).map((line) => ({
					key: String(line.id),
					label: line.name,
					detail: line.sku,
					subject: { type: "material", id: String(line.materialId), label: line.sku },
					quantity: formatQuantity(line.quantity, line.unit),
					unitPrice: line.unitPrice,
					amount: lineTotal(line.quantity, line.unitPrice),
				}));
			}
			return [id, cost];
		}),
	);
}
