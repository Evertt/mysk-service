/**
 * Changes to a single order that the order's own pages and the list's bulk actions share, so
 * changing, assigning or deleting many orders refuses what doing it to one refuses.
 */
import { error, invalid } from "@sveltejs/kit";

import { isAwaitingAcceptance, isEditableOrder } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant } from "#lib/server/auth/index.ts";
import { refuseIfReferenced } from "#lib/server/db/errors.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";

import { acceptFirst, notEditable } from "../lifecycle.ts";
import { refuseRefused, saveOrderParts } from "./hooks.ts";

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

/**
 * Why an engineer can't be assigned the current tenant's orders, if they can't: they're another
 * tenant's (or don't exist), or inactive. Planning (`transitionOrder()`'s `plan`) and bulk assigning
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
