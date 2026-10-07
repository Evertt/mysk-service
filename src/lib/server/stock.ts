/**
 * The stock ledger (`stock_movement`): `material.stock` is the cached balance of a material's
 * movements, and `moveStock` is the only thing that changes it.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { formatNumber } from "#lib/format.js";
import type { MaterialUnit, StockMovementKind } from "#lib/models.js";
import type { db } from "#lib/server/db/index.js";
import { material, stockMovement } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";

/** A transaction on the app's database, as `db.transaction` passes it to its callback. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A quantity to two decimals (the finest any unit is counted in), without floating-point noise. */
export const roundQuantity = (quantity: number) => Math.round(quantity * 100) / 100 || 0;

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
	const { organizationId, user } = requireMember();
	const found = await tx.query.material.findFirst({
		columns: { id: true, sku: true, name: true, unit: true, stock: true },
		where: and(eq(material.id, movement.materialId), inTenant(material)),
	});
	if (!found) error(404, "Material not found");

	const quantity = roundQuantity(movement.quantity);
	if (quantity === 0) return found;
	const stock = roundQuantity(found.stock + quantity);
	if (stock < 0) throw new StockShortage(found);

	await tx.insert(stockMovement).values({ ...movement, quantity, organizationId, userId: user.id });
	await tx
		.update(material)
		.set({ stock })
		.where(and(eq(material.id, found.id), inTenant(material)));
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
