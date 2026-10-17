/**
 * An order's material lines, for the modules that require materials: adding a material to one of
 * the tenant's orders (the parts shop's "Add to order" on a checklist's rejected point), through
 * the same code as the order form and the engineer portal (`saveLines()`: priced, logged against
 * the order, taking stock as its status says).
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";

import { isAwaitingAcceptance, isEditableOrder } from "#lib/models.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

import { saveLines } from "../server/lines.ts";
import { orderLine } from "../server/schema.ts";
import { OrderStockShortage } from "../server/stock.ts";

/**
 * Adds `quantity` of the tenant's material `materialId` to the tenant's order `number` in `tx`
 * (to the line it has of it already, if any). A 404 for an order of another tenant; refused
 * (`invalid()`) for an order that can't be changed (invoiced, cancelled or not accepted yet) and
 * when its status takes stock that isn't there.
 */
export async function addOrderLine(
	tx: Transaction,
	number: string,
	materialId: number,
	quantity: number,
) {
	const [found] = await tx
		.select({ id: order.id, number: order.number, status: order.status })
		.from(order)
		.where(and(eq(order.number, number), inTenant(order)));
	if (!found) error(404, m.materials_order_not_found({ number }));
	if (
		!isEditableOrder(found.status) ||
		found.status === "cancelled" ||
		isAwaitingAcceptance(found.status)
	) {
		invalid(m.materials_order_unchangeable({ number }));
	}
	const lines = await tx
		.select({ materialId: orderLine.materialId, quantity: orderLine.quantity })
		.from(orderLine)
		.where(and(eq(orderLine.orderId, found.id), inTenant(orderLine)))
		.orderBy(asc(orderLine.id));
	const existing = lines.find((line) => line.materialId === materialId);
	const after = existing
		? lines.map((line) =>
				line === existing ? { ...line, quantity: line.quantity + quantity } : line,
			)
		: [...lines, { materialId, quantity }];
	try {
		await saveLines(tx, found, found.status, after);
	} catch (shortage) {
		if (!(shortage instanceof OrderStockShortage)) throw shortage;
		invalid(shortage.message);
	}
}
