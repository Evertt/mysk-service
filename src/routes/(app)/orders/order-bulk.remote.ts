// Bulk actions on the list's selected orders (see `bulk-actions.ts`).
import { command, query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { manualOrderStatuses } from "#lib/models.js";
import { bulkChange, bulkTarget, refreshRequested } from "#lib/server/bulk.js";
import { db } from "#lib/server/db/index.js";
import { engineer, order } from "#lib/server/db/schema.js";
import { assignOrder, changeOrderStatus, removeOrder } from "#lib/server/order-changes.js";
import { assigneeProblem } from "#lib/server/orders.js";
import { inTenant, requireMember } from "#lib/server/session.js";

import { getOrderFacets, getOrders } from "./order-list.remote.js";
import { matchingOrderIds } from "./order-list.server.js";

/** The tenant's active engineers, to assign orders to. */
export const getAssignableEngineers = query(async () => {
	requireMember();
	return db
		.select({ id: engineer.id, name: engineer.name })
		.from(engineer)
		.where(and(inTenant(engineer), eq(engineer.active, true)))
		.orderBy(asc(engineer.name));
});

/** Assigns the selected orders to an active engineer of the tenant, or to nobody (`null`). */
export const bulkAssignOrders = command(
	v.object({ target: bulkTarget, engineerId: v.nullable(v.pipe(v.number(), v.integer())) }),
	async ({ target, engineerId }) => {
		requireMember();
		if (engineerId !== null) {
			const problem = await assigneeProblem(engineerId);
			if (problem) error(400, problem);
		}
		const result = await bulkChange(target, {
			table: order,
			label: order.number,
			matching: matchingOrderIds,
			change: (o) => assignOrder(o.id, engineerId),
		});
		await refreshRequested(getOrders, getOrderFacets);
		return result;
	},
);

/** Gives the selected orders a status that can be given by hand (`manualOrderStatuses`). */
export const bulkSetOrderStatus = command(
	v.object({ target: bulkTarget, status: v.picklist(manualOrderStatuses) }),
	async ({ target, status }) => {
		requireMember();
		const result = await bulkChange(target, {
			table: order,
			label: order.number,
			matching: matchingOrderIds,
			change: (o) => changeOrderStatus(o.id, status),
		});
		await refreshRequested(getOrders, getOrderFacets);
		return result;
	},
);

/** Deletes the selected orders, with the same refusals as deleting one. */
export const bulkDeleteOrders = command(bulkTarget, async (target) => {
	requireMember();
	const result = await bulkChange(target, {
		table: order,
		label: order.number,
		matching: matchingOrderIds,
		change: (o) => removeOrder(o.id),
	});
	await refreshRequested(getOrders, getOrderFacets);
	return result;
});
