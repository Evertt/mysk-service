/**
 * An order's material lines: checked, priced, saved, logged, and taking stock as the order's status
 * says. Shared by the order form (through `orders.saving`, `saveOrderMaterials()`) and the engineer
 * portal, so both do it the same way.
 */
import { and, asc, eq } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import { type OrderStatus } from "#lib/models.ts";
import type { OrderProblem, OrderSaving } from "#lib/orders/extensions.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import { idsInTenant, inTenant, requireTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { insertRows } from "#lib/server/db/parameters.ts";

import { fitsUnit, roundQuantity } from "../model.ts";
import { material, orderLine, stockMovement } from "./schema.ts";
import { moveOrderStock, OrderStockShortage } from "./stock.ts";

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
export async function checkLines(
	lines: LineInput[],
	tx: Transaction | typeof db = db,
): Promise<LineProblem[]> {
	if (!lines.length) return [];
	const materials = await tx
		.select({ id: material.id, unit: material.unit })
		.from(material)
		.where(
			idsInTenant(
				material,
				lines.map((line) => line.materialId),
			),
		);
	const units = new Map(materials.map((row) => [row.id, row.unit]));
	const problems: LineProblem[] = [];
	lines.forEach((line, index) => {
		const unit = units.get(line.materialId);
		if (!unit) {
			problems.push({ line: index, field: "materialId", message: m.materials_order_unknown() });
		} else if (!fitsUnit(line.quantity, unit)) {
			problems.push({ line: index, field: "quantity", message: m.materials_order_whole_pieces() });
		}
	});
	return problems;
}

/** One of the tenant's orders' lines as stored, in the order they were added. */
const linesOf = (tx: Transaction, orderId: number) =>
	tx
		.select({
			materialId: orderLine.materialId,
			quantity: orderLine.quantity,
			unitPrice: orderLine.unitPrice,
		})
		.from(orderLine)
		.where(and(eq(orderLine.orderId, orderId), inTenant(orderLine)))
		.orderBy(asc(orderLine.id));

/**
 * Logs the changes to an order's lines, against the order: a material added (`created`), removed
 * (`deleted`) or its quantity changed (`updated`). Lines are replaced on every save, so they're
 * told apart by material (the subject's id), with their quantities added up, like their stock.
 */
export async function recordOrderLines(
	tx: Transaction,
	order: Subject,
	before: readonly LineInput[],
	after: readonly LineInput[],
) {
	const total = (lines: readonly LineInput[]) => {
		const totals = new Map<number, number>();
		for (const line of lines) {
			totals.set(
				line.materialId,
				roundQuantity((totals.get(line.materialId) ?? 0) + line.quantity),
			);
		}
		return totals;
	};
	const [was, is] = [total(before), total(after)];
	const changed = [...new Set([...was.keys(), ...is.keys()])].filter(
		(id) => was.get(id) !== is.get(id),
	);
	if (!changed.length) return;

	const names = new Map(
		(
			await tx
				.select({ id: material.id, name: material.name })
				.from(material)
				.where(idsInTenant(material, changed))
		).map((row) => [row.id, row.name]),
	);
	for (const id of changed) {
		const [quantity, now] = [was.get(id), is.get(id)];
		await recordActivity(tx, {
			action: quantity === undefined ? "created" : now === undefined ? "deleted" : "updated",
			subject: { type: "order_line", id, label: names.get(id) ?? `#${id}` },
			parent: order,
			before: { quantity: quantity ?? null },
			after: { quantity: now ?? null },
		});
	}
}

/**
 * Replaces one of the tenant's orders' lines with `lines` (checked with `checkLines`) and takes or
 * returns stock for them as its `status` says (see `moveOrderStock`). Lines keep the price they
 * were quoted at; new materials get today's price. Logs the lines that changed against the order
 * (`recordOrderLines`). Call it in the transaction that saves the order. Throws an
 * `OrderStockShortage` if there isn't enough of a material.
 */
export async function saveLines(
	tx: Transaction,
	order: { id: number; number: string },
	status: OrderStatus,
	lines: LineInput[],
) {
	const { organizationId } = requireTenant();
	const before = await linesOf(tx, order.id);
	await tx.delete(orderLine).where(and(eq(orderLine.orderId, order.id), inTenant(orderLine)));

	if (lines.length) {
		const quoted = new Map(before.map((line) => [line.materialId, line.unitPrice]));
		const prices = new Map(
			(
				await tx
					.select({ id: material.id, unitPrice: material.unitPrice })
					.from(material)
					.where(
						idsInTenant(
							material,
							lines.map((line) => line.materialId),
						),
					)
			).map((row) => [row.id, row.unitPrice]),
		);
		await insertRows(
			tx,
			orderLine,
			lines.map((line) => ({
				organizationId,
				orderId: order.id,
				materialId: line.materialId,
				quantity: line.quantity,
				unitPrice: quoted.get(line.materialId) ?? prices.get(line.materialId) ?? 0,
			})),
		);
	}

	// In the order of the lines it had, like their stock.
	const lineOrder = [...before, ...lines].map((line) => line.materialId);
	await moveOrderStock(tx, order, { status, lines }, null, lineOrder);
	const subject = orderSubject(order);
	await recordOrderLines(tx, subject, before, lines);
}

/** Where the materials' part of the order form is, from the form's root. */
const formPath = ["modules", "materials"];

/**
 * The materials module's part of saving an order (`orders.saving`): from the order form, its
 * lines (validated by the form with `form-parts/orders.form.ts`, none when the form had no line
 * inputs; here checked against the tenant's materials, saved and logged); for every change, the stock that follows its status (taken
 * or returned as the stock ledger says it holds, see `moveOrderStock`); for a deletion, what it
 * held back into stock, its movements no longer referring to it. Answers the problems with the
 * lines, or a shortage of stock, on the form's field where there is one.
 */
export async function saveOrderMaterials({
	tx,
	order,
	status,
	form,
}: OrderSaving): Promise<OrderProblem[] | undefined> {
	let submitted: LineInput[] | undefined;
	try {
		if (form && status) {
			submitted = form.materials?.lines ?? [];
			const problems = await checkLines(submitted, tx);
			if (problems.length) {
				return problems.map(({ line, field, message }) => ({
					path: [...formPath, "lines", line, field],
					message,
				}));
			}
			await saveLines(tx, order, status, submitted);
			return undefined;
		}
		if (status) {
			await moveOrderStock(tx, order, { status, lines: await linesOf(tx, order.id) });
			return undefined;
		}
	} catch (error) {
		if (!(error instanceof OrderStockShortage)) throw error;
		const line = submitted?.findLastIndex((each) => each.materialId === error.materialId) ?? -1;
		const path = line >= 0 ? [...formPath, "lines", line, "quantity"] : undefined;
		return [{ path, message: error.message }];
	}

	// Being deleted: what it held goes back into stock. The stock history keeps the order's number,
	// but no longer refers to the order itself. The note is stored, in the language of whoever
	// deletes it.
	const lines = await linesOf(tx, order.id);
	await moveOrderStock(tx, order, { status: null, lines }, m.materials_stock_note_order_deleted());
	await tx
		.update(stockMovement)
		.set({ orderId: null })
		.where(and(eq(stockMovement.orderId, order.id), inTenant(stockMovement)));
	return undefined;
}
