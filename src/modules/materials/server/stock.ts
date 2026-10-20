/**
 * The stock ledger (`stock_movement`): `material.stock` is the cached balance of a material's
 * movements, and `moveStock` is the only thing that changes it.
 */
import { and, eq, sql, type SQLWrapper } from "drizzle-orm";

import { formatNumber } from "#lib/i18n/index.ts";
import { type OrderStatus } from "#lib/models.ts";
import { idInTenant, inTenant, requireTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { materialLabels } from "../labels.ts";
import {
	holdsStock,
	lowStockThresholds,
	type MaterialUnit,
	materialUnits,
	roundQuantity,
	type StockLevel,
	type StockMovementKind,
} from "../model.ts";
import { material, stockMovement } from "./schema.ts";

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

/**
 * The message of a shortage of `material`: only `quantity` in stock.
 */
const shortage = (quantity: number, material: { name: string; unit: MaterialUnit }) =>
	m.materials_stock_shortage({
		quantity: formatNumber(quantity),
		unit: materialLabels.label("materialUnitSymbol", material.unit),
		material: material.name,
	});

/**
 * A material whose stock is too low for a movement, with the stock it does have: a refusal, which
 * a caller that knows more (the order's line, the shop's product) may say better.
 */
export class StockShortage extends Refused {
	constructor(
		readonly material: { id: number; sku: string; name: string; unit: MaterialUnit; stock: number },
	) {
		super(shortage(material.stock, material));
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
	const found = orNotFound(
		await tx.query.material.findFirst({
			columns: { id: true, sku: true, name: true, unit: true, stock: true },
			where: idInTenant(material, movement.materialId),
		}),
		m.materials_not_found(),
	);

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

/**
 * An order's status and material lines, which decide what it holds of the stock. A status of
 * `null` is an order being deleted.
 */
export interface OrderStock {
	status: OrderStatus | null;
	lines: { materialId: number; quantity: number }[];
}

/**
 * The lines of an order that hold stock: all of them while its status holds stock (see
 * `holdsStock`), none while it's a quote, once it's cancelled, or while it's being deleted.
 */
export const heldLines = (order: OrderStock) =>
	order.status && holdsStock(order.status) ? order.lines : [];

/** An order that needs more of a material than is in stock, with what it can have: a refusal. */
export class OrderStockShortage extends Refused {
	constructor(
		readonly materialId: number,
		/** The stock, plus what the order already held of it. */
		readonly available: number,
		material: { name: string; unit: MaterialUnit },
	) {
		super(shortage(available, material));
	}
}

/**
 * What one of the tenant's orders holds of each material, as its stock movements say: what it took
 * less what it gave back. Materials it holds none of are left out.
 */
async function heldByOrder(tx: Transaction, orderId: number) {
	const rows = await tx
		.select({
			materialId: stockMovement.materialId,
			quantity: sql<number>`-sum(${stockMovement.quantity})`,
		})
		.from(stockMovement)
		.where(and(eq(stockMovement.orderId, orderId), inTenant(stockMovement)))
		.groupBy(stockMovement.materialId)
		.orderBy(sql`min(${stockMovement.id})`);
	return rows
		.map((row) => ({ materialId: row.materialId, quantity: roundQuantity(row.quantity) }))
		.filter((row) => row.quantity !== 0);
}

/**
 * Takes or returns stock for an order whose status or lines changed, or that is being deleted
 * (its status `null`): the difference between what it holds as the stock ledger says
 * (`heldByOrder`) and what it should hold now (see `heldLines`), recorded with the order. So
 * scheduling a quote takes its materials, cancelling an order returns them, deleting it returns
 * what it took, and an order whose status changed while the tenant had materials switched off is
 * put right. The movements go in the order of `lineOrder` (material ids, by default the lines'),
 * then the new materials'. Call it in the transaction that changes the order. Throws an
 * `OrderStockShortage` if there isn't enough of a material.
 */
export async function moveOrderStock(
	tx: Transaction,
	order: { id: number; number: string },
	after: OrderStock,
	note: string | null = null,
	lineOrder: number[] = after.lines.map((line) => line.materialId),
) {
	const rank = (materialId: number) => {
		const index = lineOrder.indexOf(materialId);
		return index < 0 ? lineOrder.length : index;
	};
	const held = (await heldByOrder(tx, order.id)).toSorted(
		(a, b) => rank(a.materialId) - rank(b.materialId),
	);
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
			const taken = held.find((line) => line.materialId === materialId)?.quantity ?? 0;
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
