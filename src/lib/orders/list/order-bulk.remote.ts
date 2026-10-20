// Bulk actions on the list's selected orders (see `bulk-actions.ts`).
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { label } from "#lib/i18n/index.ts";
import { manualOrderStatuses } from "#lib/models.ts";
import { recordId } from "#lib/schema.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";
import { bulkChange, listTarget, refreshRequested } from "#lib/server/lists/index.ts";
import { Refused } from "#lib/server/refused.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { transitionOrder } from "../server/lifecycle.ts";
import { ordersSql } from "../server/list-sql.ts";
import { assignOrder, assigneeProblem, removeOrder } from "../server/order-changes.ts";
import { getOrderFacets, getOrders } from "./order-list.remote.ts";
import { ordersList } from "./orders-list.ts";

/** The selected orders, or all those matching the list's search and filters. */
const ordersTarget = listTarget(ordersList.where);

/** The tenant's active engineers, to assign orders to. */
export const getAssignableEngineers = forMembers.query(async () => {
	return db
		.select({ id: engineer.id, name: engineer.name })
		.from(engineer)
		.where(and(inTenant(engineer), eq(engineer.active, true)))
		.orderBy(asc(engineer.name));
});

/** Assigns the selected orders to an active engineer of the tenant, or to nobody (`null`). */
export const bulkAssignOrders = forMembers.command(
	v.object({ target: ordersTarget, engineerId: v.nullable(recordId()) }),
	async ({ target, engineerId }) => {
		if (engineerId !== null) {
			const problem = await assigneeProblem(engineerId);
			if (problem) error(400, problem);
		}
		const result = await bulkChange(target, {
			table: order,
			label: order.number,
			list: ordersSql,
			change: (o) => assignOrder(o.id, engineerId),
		});
		await refreshRequested(getOrders, getOrderFacets);
		return result;
	},
);

/**
 * Gives the selected orders a status that can be given by hand (`manualOrderStatuses`). An order
 * that already has it is skipped, with the reason, rather than counted as updated.
 */
export const bulkSetOrderStatus = forMembers.command(
	v.object({ target: ordersTarget, status: v.picklist(manualOrderStatuses) }),
	async ({ target, status }) => {
		const result = await bulkChange(target, {
			table: order,
			label: order.number,
			columns: { status: order.status },
			list: ordersSql,
			change: async (o) => {
				// `transitionOrder()` would leave it as it is, but say nothing of it.
				if (o.status === status) {
					const named = label("orderStatus", status).toLowerCase();
					throw new Refused(m.orders_bulk_status_unchanged({ number: o.label, status: named }));
				}
				await db.transaction((tx) => transitionOrder(tx, { verb: "set", id: o.id, to: status }));
			},
		});
		await refreshRequested(getOrders, getOrderFacets);
		return result;
	},
);

/** Deletes the selected orders, with the same refusals as deleting one. */
export const bulkDeleteOrders = forMembers.command(ordersTarget, async (target) => {
	const result = await bulkChange(target, {
		table: order,
		label: order.number,
		list: ordersSql,
		change: (o) => removeOrder(o.id),
	});
	await refreshRequested(getOrders, getOrderFacets);
	return result;
});
