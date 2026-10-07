/**
 * An order's material lines, shared by the office's order form and the engineer portal, so both
 * check, price and take stock for lines the same way.
 */
import { and, eq, inArray } from "drizzle-orm";

import { fitsUnit, type OrderStatus } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";
import { material, orderLine } from "#lib/server/db/schema.js";
import { inTenant, requireTenant } from "#lib/server/session.js";
import { moveOrderStock, type Transaction } from "#lib/server/stock.js";

export interface LineInput {
	materialId: number;
	/** In the material's unit. */
	quantity: number;
}

/** A problem with one of the submitted lines, by its index. */
export interface LineProblem {
	line: number;
	field: "materialId" | "quantity";
	message: string;
}

/** Checks that the lines' materials exist in the current tenant and fit their units. */
export async function checkLines(lines: LineInput[]): Promise<LineProblem[]> {
	if (!lines.length) return [];
	const materials = await db
		.select({ id: material.id, unit: material.unit })
		.from(material)
		.where(
			and(
				inArray(
					material.id,
					lines.map((line) => line.materialId),
				),
				inTenant(material),
			),
		);
	const units = new Map(materials.map((row) => [row.id, row.unit]));
	const problems: LineProblem[] = [];
	lines.forEach((line, index) => {
		const unit = units.get(line.materialId);
		if (!unit) {
			problems.push({ line: index, field: "materialId", message: "Unknown material" });
		} else if (!fitsUnit(line.quantity, unit)) {
			problems.push({ line: index, field: "quantity", message: "Whole pieces only" });
		}
	});
	return problems;
}

/**
 * Replaces an order's lines with `after.lines` and takes or returns stock for the change from
 * `before` (its status and lines as stored, or none for a new order) to `after` (see
 * `moveOrderStock`). Lines keep the price they were quoted at; new materials get today's price.
 * Call it in the transaction that saves the order, after checking the lines with `checkLines`.
 * Throws an `OrderStockShortage` if there isn't enough of a material.
 */
export async function saveOrderLines(
	tx: Transaction,
	order: { id: number; number: string },
	before: { status: OrderStatus; lines: (LineInput & { unitPrice: number })[] } | undefined,
	after: { status: OrderStatus; lines: LineInput[] },
) {
	const { organizationId } = requireTenant();
	const { lines } = after;
	await tx.delete(orderLine).where(and(eq(orderLine.orderId, order.id), inTenant(orderLine)));

	if (lines.length) {
		const quoted = new Map(before?.lines.map((line) => [line.materialId, line.unitPrice]));
		const prices = new Map(
			(
				await tx
					.select({ id: material.id, unitPrice: material.unitPrice })
					.from(material)
					.where(
						and(
							inArray(
								material.id,
								lines.map((line) => line.materialId),
							),
							inTenant(material),
						),
					)
			).map((row) => [row.id, row.unitPrice]),
		);
		await tx.insert(orderLine).values(
			lines.map((line) => ({
				organizationId,
				orderId: order.id,
				materialId: line.materialId,
				quantity: line.quantity,
				unitPrice: quoted.get(line.materialId) ?? prices.get(line.materialId) ?? 0,
			})),
		);
	}

	await moveOrderStock(tx, order, before ?? { status: after.status, lines: [] }, after);
}
