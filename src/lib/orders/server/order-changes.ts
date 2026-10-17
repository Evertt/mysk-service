/**
 * Changes to a single order that the order's own pages and the list's bulk actions share, so
 * changing, assigning or deleting many orders refuses what doing it to one refuses.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, isNull } from "drizzle-orm";

import {
	isAwaitingAcceptance,
	isDoneOrder,
	isEditableOrder,
	type OrderStatus,
} from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant, idsInTenant } from "#lib/server/auth/index.ts";
import { refuseIfReferenced } from "#lib/server/db/errors.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";

import { OrderRefused, saveOrderParts } from "./hooks.ts";

/** Why an order can't be changed or deleted (see `isEditableOrder`). */
export const notEditable = (number: string, change: "changed" | "deleted") =>
	change === "changed"
		? m.orders_invoiced_cant_change({ number })
		: m.orders_invoiced_cant_delete({ number });

/**
 * Why an order awaiting acceptance can't be changed: it's accepted or rejected first (see
 * `./acceptance.ts`), then changed like any other.
 */
export const acceptFirst = (number: string) => m.orders_accept_first({ number });

/** When an order with `status` was completed: kept from before, set when it's done, else none. */
export const completedAt = (
	status: OrderStatus,
	existing?: { completedAt: Temporal.Instant | null },
) => (isDoneOrder(status) ? (existing?.completedAt ?? Temporal.Now.instant()) : null);

/**
 * Deletes one of the current tenant's orders, after the modules have let go of it (e.g. what it
 * held goes back into stock). Refuses an invoiced order, one that a module refuses to let go of,
 * and one that an optional module's record (e.g. an invoice) still refers to; a 404 if there's no
 * such order. The order's page and the list's bulk delete share it.
 */
export async function removeOrder(id: number) {
	const deleting = db.transaction(async (tx) => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true },
			where: idInTenant(order, id),
		});
		if (!found) error(404, m.orders_not_found_plain());
		if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "deleted"));
		await saveOrderParts({ tx, order: found, status: null }).catch(refuseRefused);
		await tx.delete(order).where(idInTenant(order, found.id));
		await recordActivity(tx, {
			action: "deleted",
			subject: { type: "order", id, label: found.number },
		});
	});
	// E.g. an optional module's record, such as an invoice, may still refer to it.
	await refuseIfReferenced(() => deleting, m.orders_delete_referenced());
}

/** Refuses with what a module said when it refused its part of an order's change. */
function refuseRefused(error: unknown): never {
	if (error instanceof OrderRefused) invalid(error.message);
	throw error;
}

/**
 * Gives one of the tenant's orders another status, as saving it in the order form would: not an
 * invoiced one; its completion date set or cleared; the modules' parts following it (e.g. its
 * materials taken from or returned to stock, refused if there isn't enough). A 404 if there's no
 * such order.
 */
export async function changeOrderStatus(id: number, status: OrderStatus) {
	await db
		.transaction(async (tx) => {
			const found = await tx.query.order.findFirst({ where: idInTenant(order, id) });
			if (!found) error(404, m.orders_not_found_plain());
			if (!isEditableOrder(found.status)) invalid(notEditable(found.number, "changed"));
			if (found.status === status) return;
			if (isAwaitingAcceptance(found.status)) invalid(acceptFirst(found.number));
			const values = { status, completedAt: completedAt(status, found) };
			await tx.update(order).set(values).where(idInTenant(order, id));
			// Thrown when refused, so the transaction stores nothing of it.
			await saveOrderParts({ tx, order: found, status });
			const subject = { type: "order", id, label: found.number };
			const ignore = ["completedAt"];
			await recordActivity(tx, {
				action: "updated",
				subject,
				before: found,
				after: values,
				ignore,
			});
		})
		.catch(refuseRefused);
}

/**
 * Gives the tenant's `orders` (as loaded: their status is what it was) another status in the
 * transaction `tx`, for an optional module that moves orders along with its own records, such as
 * invoicing: the completion date is set or cleared as `completedAt()` does, and one `updated`
 * entry per order is logged, with `note` (stored, so in the language of whoever makes the change)
 * saying why. It makes no checks: the caller has them (an order's editability stays with
 * `changeOrderStatus()`). Nor does it ask the modules about their parts (`orders.saving`): the
 * statuses it moves between, completed and invoiced, are the same to them (both hold stock).
 */
export async function setOrdersStatus(
	tx: Transaction,
	orders: { id: number; number: string; status: OrderStatus }[],
	status: OrderStatus,
	note?: string,
) {
	if (!orders.length) return;
	const where = idsInTenant(
		order,
		orders.map((o) => o.id),
	);
	// An order that has a completion date keeps it while it stays done.
	await tx
		.update(order)
		.set(isDoneOrder(status) ? { status } : { status, completedAt: null })
		.where(where);
	if (isDoneOrder(status)) {
		await tx
			.update(order)
			.set({ completedAt: completedAt(status) })
			.where(and(where, isNull(order.completedAt)));
	}
	for (const changed of orders) {
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "order", id: changed.id, label: changed.number },
			before: changed,
			after: { status },
			note,
		});
	}
}

/**
 * Why an engineer can't be assigned the current tenant's orders, if they can't: they're another
 * tenant's (or don't exist), or inactive. Scheduling (`scheduleOrder()`) and bulk assigning
 * share it.
 */
export async function assigneeProblem(
	engineerId: number,
	tx: Transaction | typeof db = db,
): Promise<string | undefined> {
	const assignee = await tx.query.engineer.findFirst({
		columns: { name: true, active: true },
		where: idInTenant(engineer, engineerId),
	});
	if (!assignee) return m.orders_unknown_engineer();
	if (!assignee.active) return m.orders_engineer_inactive({ name: assignee.name });
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
		if (isAwaitingAcceptance(found.status)) invalid(acceptFirst(found.number));
		await tx.update(order).set({ engineerId }).where(idInTenant(order, id));
		const subject = { type: "order", id, label: found.number };
		await recordActivity(tx, { action: "updated", subject, before: found, after: { engineerId } });
	});
}
