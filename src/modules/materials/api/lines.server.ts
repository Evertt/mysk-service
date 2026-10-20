/**
 * An order's material lines, for the modules that require materials: adding a material to one of
 * the tenant's orders (the parts shop's "Add to order" on a checklist's rejected point), through
 * the same code as the order form and the engineer portal (`checkLines()` and `saveLines()`:
 * checked, priced, logged against the order, taking stock as its status says), and refreshing the
 * modules' cards on the order as its save does (`orders.committed`).
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";

import { isAwaitingAcceptance, isEditableOrder, type OrderStatus } from "#lib/models.ts";
import { orderCommitted, orderByNumber } from "#lib/orders/server/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

import { checkLines, saveLines } from "../server/lines.ts";
import { orderLine } from "../server/schema.ts";
import { OrderStockShortage } from "../server/stock.ts";

/**
 * Whether an order in `status` can take material lines: not invoiced, cancelled or waiting for
 * acceptance (which changes it only by accepting or rejecting it).
 */
export const canTakeLines = (status: OrderStatus) =>
	isEditableOrder(status) && status !== "cancelled" && !isAwaitingAcceptance(status);

/**
 * Adds `quantity` of the tenant's material `materialId` to the tenant's order `number` in `tx`
 * (to the line it has of it already, if any). A 404 for an order or a material of another tenant;
 * refused (`Refused`) for an order that can't be changed (invoiced, cancelled or not accepted
 * yet), for part of a piece, and when its status takes stock that isn't there. Once `tx` has
 * committed, the modules refresh their cards on the order (`orderCommitted()`); the caller
 * refreshes core's (`getOrder`), as the order form does.
 */
export async function addOrderLine(
	tx: Transaction,
	number: string,
	materialId: number,
	quantity: number,
) {
	const found = await orderByNumber(
		number,
		{ id: order.id, number: order.number, status: order.status },
		tx,
	);
	if (!canTakeLines(found.status)) throw new Refused(m.materials_order_unchangeable({ number }));
	const [problem] = await checkLines([{ materialId, quantity }], tx);
	if (problem?.field === "materialId") error(404, problem.message);
	if (problem) throw new Refused(problem.message);
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
		throw new Refused(shortage.message);
	}
	orderCommitted({ number: found.number });
}
