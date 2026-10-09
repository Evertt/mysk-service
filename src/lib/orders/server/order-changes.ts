/**
 * Changes to a single order that the order's own pages and the list's bulk actions share, so
 * changing, assigning or deleting many orders refuses what doing it to one refuses.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { moveOrderStock, OrderStockShortage } from "#lib/materials/server/stock.ts";
import { isDoneOrder, isEditableOrder, type OrderStatus } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";
import { recordActivity } from "#lib/server/activity";
import { idInTenant, inTenant } from "#lib/server/auth";
import { refuseIfReferenced } from "#lib/server/db/errors.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, order, stockMovement } from "#lib/server/db/schema.ts";

/** Why an order can't be changed or deleted (see `isEditableOrder`). */
export const notEditable = (number: string, change: "changed" | "deleted") =>
	change === "changed"
		? m.orders_invoiced_cant_change({ number })
		: m.orders_invoiced_cant_delete({ number });

/** When an order with `status` was completed: kept from before, set when it's done, else none. */
export const completedAt = (status: OrderStatus, existing?: { completedAt: Date | null }) =>
	isDoneOrder(status) ? (existing?.completedAt ?? new Date()) : null;

/**
 * Deletes one of the current tenant's orders; what it held goes back into stock. Refuses an
 * invoiced order, and one that an optional module's record (e.g. an invoice) still refers to; a
 * 404 if there's no such order. The order's page and the list's bulk delete share it.
 */
export async function removeOrder(id: number) {
	const deleting = db.transaction(async (tx) => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true },
			where: idInTenant(order, id),
			with: { lines: true },
		});
		if (!found) error(404, m.orders_not_found_plain());
		if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "deleted"));
		// What it held goes back into stock. The stock history keeps the order's number, but no
		// longer refers to the order itself.
		// The note is stored, in the language of whoever deletes it.
		const note = m.orders_stock_note_deleted();
		await moveOrderStock(tx, found, found, { status: found.status, lines: [] }, note);
		await tx
			.update(stockMovement)
			.set({ orderId: null })
			.where(and(eq(stockMovement.orderId, found.id), inTenant(stockMovement)));
		await tx.delete(order).where(idInTenant(order, found.id));
		await recordActivity(tx, {
			action: "deleted",
			subject: { type: "order", id, label: found.number },
		});
	});
	// E.g. an optional module's record, such as an invoice, may still refer to it.
	await refuseIfReferenced(() => deleting, m.orders_delete_referenced());
}

/**
 * Gives one of the tenant's orders another status, as saving it in the order form would: not an
 * invoiced one; its completion date set or cleared; its materials taken from or returned to stock
 * (refused if there isn't enough). A 404 if there's no such order.
 */
export async function changeOrderStatus(id: number, status: OrderStatus) {
	try {
		await db.transaction(async (tx) => {
			const found = await tx.query.order.findFirst({
				where: idInTenant(order, id),
				with: { lines: true },
			});
			if (!found) error(404, m.orders_not_found_plain());
			if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "changed"));
			if (found.status === status) return;
			const values = { status, completedAt: completedAt(status, found) };
			await tx.update(order).set(values).where(idInTenant(order, id));
			await moveOrderStock(tx, found, found, { status, lines: found.lines });
			const subject = { type: "order", id, label: found.number };
			const ignore = ["completedAt"];
			await recordActivity(tx, {
				action: "updated",
				subject,
				before: found,
				after: values,
				ignore,
			});
		});
	} catch (error) {
		// Thrown, so the transaction stores nothing of it.
		if (error instanceof OrderStockShortage) invalid(error.message);
		throw error;
	}
}

/**
 * Why an engineer can't be assigned the current tenant's orders, if they can't: they're another
 * tenant's (or don't exist), or inactive. The planning board and bulk assigning share it.
 */
export async function assigneeProblem(
	engineerId: number,
	tx: Transaction | typeof db = db,
): Promise<string | undefined> {
	const assignee = await tx.query.engineer.findFirst({
		columns: { name: true, active: true },
		where: idInTenant(engineer, engineerId),
	});
	if (!assignee) return m.schedule_unknown_engineer();
	if (!assignee.active) return m.schedule_engineer_inactive({ name: assignee.name });
	return undefined;
}

/** Assigns one of the tenant's orders to an engineer (checked already), or to nobody. */
export async function assignOrder(id: number, engineerId: number | null) {
	await db.transaction(async (tx) => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true, engineerId: true },
			where: idInTenant(order, id),
		});
		if (!found) error(404, m.orders_not_found_plain());
		if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "changed"));
		if (found.engineerId === engineerId) return;
		await tx.update(order).set({ engineerId }).where(idInTenant(order, id));
		const subject = { type: "order", id, label: found.number };
		await recordActivity(tx, { action: "updated", subject, before: found, after: { engineerId } });
	});
}
