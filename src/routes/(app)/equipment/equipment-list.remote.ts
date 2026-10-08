import { command, query } from "$app/server";
import { and, count, inArray } from "drizzle-orm";
import * as v from "valibot";

import { queryKey } from "#lib/components/data-table/list-definition.js";
import { removeEquipment } from "#lib/equipment/server/equipment.js";
import { equipmentStatuses, openOrderStatuses } from "#lib/models.js";
import { recordActivity } from "#lib/server/activity.js";
import { bulkChange, listTarget, refreshRequested } from "#lib/server/bulk.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { idInTenant, inTenant, requireMember } from "#lib/server/session.js";
import { pageGroupsOf, planList } from "#lib/server/table-query.js";

import { equipmentList } from "./equipment-list.js";
import { equipmentSql, withEquipmentJoins } from "./equipment-list.server.js";

/**
 * A page of the tenant's units with their owner and number of open orders, searched, filtered,
 * sorted and grouped as the query says (see `equipmentList`), how many match in all, and, when
 * grouped, what the table needs to know of the page's groups.
 */
export const getEquipmentList = query(equipmentList.query, async (input) => {
	requireMember();
	const plan = planList(equipmentSql(), input);
	const [fetched, rowCount, counts] = await Promise.all([
		plan.paged(
			withEquipmentJoins(
				db
					.select({
						id: equipment.id,
						serialNumber: equipment.serialNumber,
						manufacturer: equipment.manufacturer,
						model: equipment.model,
						category: equipment.category,
						status: equipment.status,
						installedAt: equipment.installedAt,
						warrantyUntil: equipment.warrantyUntil,
						customer: { id: customer.id, code: customer.code, name: customer.name },
					})
					.from(equipment)
					.$dynamic(),
			),
		),
		plan.count(),
		plan.groupCounts(),
	]);

	// The page's open orders (only).
	const ids = fetched.map((row) => row.id);
	const open = ids.length
		? await db
				.select({ equipmentId: order.equipmentId, count: count() })
				.from(order)
				.where(
					and(
						inTenant(order),
						inArray(order.equipmentId, ids),
						inArray(order.status, openOrderStatuses),
					),
				)
				.groupBy(order.equipmentId)
		: [];
	const openOf = new Map(open.map((row) => [row.equipmentId, row.count]));

	const page = plan.page(fetched.map((row) => ({ ...row, openOrders: openOf.get(row.id) ?? 0 })));
	return {
		rows: page.rows,
		rowCount,
		/** The query the rows are for (its `where` is the target of "select all matching"). */
		query: input,
		/** The same as a string, to tell whether the table is waiting for other rows (`isStale`). */
		key: queryKey(input),
		groups: pageGroupsOf(counts, page),
	};
});

/**
 * How many units have each category, status and manufacturer, for the list's filters: of those
 * matching the search and the other filters.
 */
export const getEquipmentFacets = query(equipmentList.where, async (where) => {
	requireMember();
	return planList(equipmentSql(), where).facets({
		category: equipment.category,
		status: equipment.status,
		manufacturer: equipment.manufacturer,
	});
});

// --- Bulk actions on the list's selected units (see `bulk-actions.ts`) -------------------------

/** The selected units, or all those matching the list's search and filters. */
const equipmentTarget = listTarget(equipmentList.where);

/** Gives the selected units another status, e.g. decommissioned. */
export const bulkSetEquipmentStatus = command(
	v.object({ target: equipmentTarget, status: v.picklist(equipmentStatuses) }),
	async ({ target, status }) => {
		requireMember();
		const result = await bulkChange(target, {
			table: equipment,
			label: equipment.serialNumber,
			columns: { status: equipment.status },
			list: equipmentSql,
			change: (unit) =>
				db.transaction(async (tx) => {
					if (unit.status === status) return;
					await tx.update(equipment).set({ status }).where(idInTenant(equipment, unit.id));
					const subject = { type: "equipment", id: unit.id, label: unit.label };
					await recordActivity(tx, { action: "updated", subject, before: unit, after: { status } });
				}),
		});
		await refreshRequested(getEquipmentList, getEquipmentFacets);
		return result;
	},
);

/** Deletes the selected units, with the same refusals as deleting one. */
export const bulkDeleteEquipment = command(equipmentTarget, async (target) => {
	requireMember();
	const result = await bulkChange(target, {
		table: equipment,
		label: equipment.serialNumber,
		list: equipmentSql,
		change: (unit) => removeEquipment(unit.id),
	});
	await refreshRequested(getEquipmentList, getEquipmentFacets);
	return result;
});
