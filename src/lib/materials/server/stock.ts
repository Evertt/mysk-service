/**
 * The stock ledger (`stock_movement`): `material.stock` is the cached balance of a material's
 * movements, and `moveStock` is the only thing that changes it.
 */
import { error } from "@sveltejs/kit";
import { sql, type SQLWrapper } from "drizzle-orm";

import { formatNumber } from "#lib/format.js";
import { label } from "#lib/i18n/labels.js";
import {
	holdsStock,
	lowStockThresholds,
	type MaterialUnit,
	materialUnits,
	type OrderStatus,
	roundQuantity,
	type StockLevel,
	type StockMovementKind,
} from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import type { Transaction } from "#lib/server/db/index.js";
import { material, stockMovement } from "#lib/server/db/schema.js";
import { idInTenant, requireTenant } from "#lib/server/session.js";

/**
 * A material's stock level in SQL, as `stockLevel()` works it out (with the same thresholds), to
 * filter and sort by in the database, e.g. `stockLevelSql(material.stock, material.unit)`.
 */
export function stockLevelSql(stock: SQLWrapper, unit: SQLWrapper) {
	const thresholds = materialUnits.map(
		(each) => sql`when ${each} then ${lowStockThresholds[each]}`,
	);
	const threshold = sql`(case ${unit} ${sql.join(thresholds, sql` `)} end)`;
	const [out, low, inStock]: StockLevel[] = ["out", "low", "in_stock"];
	return sql<StockLevel>`(case when ${stock} <= 0 then ${out} when ${stock} < ${threshold} then ${low} else ${inStock} end)`;
}

/** A material whose stock is too low for a movement, with the stock it does have. */
export class StockShortage extends Error {
	constructor(
		readonly material: { id: number; sku: string; name: string; unit: MaterialUnit; stock: number },
	) {
		super(`Only ${formatNumber(material.stock)} ${material.unit} of ${material.name} in stock`);
	}
}

export interface Movement {
	materialId: number;
	/** In the material's unit: positive adds to the stock, negative takes from it. */
	quantity: number;
	kind: StockMovementKind;
	/** The order (and its number) whose lines take or return the stock. */
	orderId?: number | null;
	orderNumber?: string | null;
	note?: string | null;
}

/**
 * Changes a material of the current tenant's stock by `movement.quantity`: records the movement
 * (by the signed-in user) and updates the cached balance. Call it inside the `db.transaction` that
 * makes the change causing it (e.g. saving an order's lines), so they're stored together or not at
 * all. Throws a `StockShortage` if the stock would go below zero, and a 404 for a material of
 * another tenant. A zero quantity changes nothing. Returns the material with its new stock.
 */
export async function moveStock(tx: Transaction, movement: Movement) {
	const { organizationId, user } = requireTenant();
	const found = await tx.query.material.findFirst({
		columns: { id: true, sku: true, name: true, unit: true, stock: true },
		where: idInTenant(material, movement.materialId),
	});
	if (!found) error(404, m.materials_not_found());

	const quantity = roundQuantity(movement.quantity);
	if (quantity === 0) return found;
	const stock = roundQuantity(found.stock + quantity);
	if (stock < 0) throw new StockShortage(found);

	await tx.insert(stockMovement).values({ ...movement, quantity, organizationId, userId: user.id });
	await tx.update(material).set({ stock }).where(idInTenant(material, found.id));
	return { ...found, stock };
}

/**
 * How much more of each material `after` takes than `before` (e.g. an order's lines before and
 * after an edit): positive to consume, negative to return. Materials whose total stays the same
 * are left out.
 */
export function stockChanges(
	before: { materialId: number; quantity: number }[],
	after: { materialId: number; quantity: number }[],
) {
	const changes = new Map<number, number>();
	for (const line of before) {
		changes.set(line.materialId, (changes.get(line.materialId) ?? 0) - line.quantity);
	}
	for (const line of after) {
		changes.set(line.materialId, (changes.get(line.materialId) ?? 0) + line.quantity);
	}
	return new Map(
		[...changes]
			.map(([materialId, change]) => [materialId, roundQuantity(change)] as const)
			.filter(([, change]) => change !== 0),
	);
}

/** An order's status and material lines, which decide what it holds of the stock. */
export interface OrderStock {
	status: OrderStatus;
	lines: { materialId: number; quantity: number }[];
}

/**
 * The lines of an order that hold stock: all of them while its status holds stock (see
 * `holdsStock`), none while it's a quote or once it's cancelled.
 */
export const heldLines = (order: OrderStock) => (holdsStock(order.status) ? order.lines : []);

/** An order that needs more of a material than is in stock, with what it can have. */
export class OrderStockShortage extends Error {
	constructor(
		readonly materialId: number,
		/** The stock, plus what the order already held of it. */
		readonly available: number,
		material: { name: string; unit: MaterialUnit },
	) {
		super(
			m.orders_stock_shortage({
				quantity: formatNumber(available),
				unit: label("materialUnitSymbol", material.unit),
				material: material.name,
			}),
		);
	}
}

/**
 * Takes or returns stock for an order whose status or lines change from `before` to `after`: the
 * difference in what it holds (see `heldLines`), recorded with the order. So scheduling a quote
 * takes its materials, cancelling an order returns them, and an order that holds nothing returns
 * nothing. Call it in the transaction that changes the order. Throws an `OrderStockShortage` if
 * there isn't enough of a material.
 */
export async function moveOrderStock(
	tx: Transaction,
	order: { id: number; number: string },
	before: OrderStock,
	after: OrderStock,
	note: string | null = null,
) {
	const held = heldLines(before);
	for (const [materialId, change] of stockChanges(held, heldLines(after))) {
		try {
			await moveStock(tx, {
				materialId,
				quantity: -change,
				kind: change > 0 ? "consumption" : "return",
				orderId: order.id,
				orderNumber: order.number,
				note,
			});
		} catch (error) {
			if (!(error instanceof StockShortage)) throw error;
			const taken = held
				.filter((line) => line.materialId === materialId)
				.reduce((sum, line) => sum + line.quantity, 0);
			throw new OrderStockShortage(
				materialId,
				roundQuantity(error.material.stock + taken),
				error.material,
			);
		}
	}
}

/**
 * Movements (newest first) with the stock right after each, counted back from the current stock.
 */
export function withBalances<T extends { quantity: number }>(movements: T[], stock: number) {
	let balance = stock;
	return movements.map((movement) => {
		const row = { ...movement, balance: roundQuantity(balance) };
		balance -= movement.quantity;
		return row;
	});
}
