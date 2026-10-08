import { command, query } from "$app/server";
import { and, count, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import { equipmentStatuses, openOrderStatuses } from "#lib/models.js";
import { recordActivity } from "#lib/server/activity.js";
import { bulkChange, bulkTarget, refreshRequested } from "#lib/server/bulk.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { removeEquipment } from "#lib/server/equipment.js";
import { idInTenant, inTenant, requireMember, tenantJoin } from "#lib/server/session.js";
import {
	facetCounts,
	groupCounts,
	nocase,
	oneOf,
	pageGroupsOf,
	planTable,
	type ServerTable,
	tableParams,
} from "#lib/server/table-query.js";

import { equipmentUrl } from "./equipment-url.js";

/** The equipment list's columns in SQL, for its URL state (`equipmentUrl`). */
const equipmentTable = (): ServerTable => ({
	spec: equipmentUrl,
	columns: {
		unit: { sort: [nocase(equipment.manufacturer), nocase(equipment.model)] },
		serialNumber: { sort: equipment.serialNumber },
		manufacturer: {
			sort: nocase(equipment.manufacturer),
			filter: oneOf(equipment.manufacturer),
			group: equipment.manufacturer,
		},
		category: {
			sort: equipment.category,
			filter: oneOf(equipment.category),
			group: equipment.category,
		},
		status: { sort: equipment.status, filter: oneOf(equipment.status), group: equipment.status },
		customer: { sort: nocase(customer.name), filter: oneOf(customer.code), group: customer.code },
		installedAt: { sort: equipment.installedAt },
		warrantyUntil: { sort: equipment.warrantyUntil },
		// Counted for every unit only to sort by them (the page's own are counted apart).
		openOrders: {
			sort: sql`(select count(*) from ${order} where ${and(
				inTenant(order),
				eq(order.equipmentId, equipment.id),
				inArray(order.status, openOrderStatuses),
			)})`,
		},
	},
	search: [
		equipment.serialNumber,
		equipment.manufacturer,
		equipment.model,
		customer.name,
		customer.code,
	],
	tieBreaker: equipment.id,
	scope: () => inTenant(equipment),
});

/** How many units match `where` (with their owner, as in the list): in all, or per value of `by`. */
function countEquipment(where: SQL | undefined, by?: SQLWrapper) {
	const counted = db
		.select({ value: sql<unknown>`${by ?? sql`null`}`, count: count() })
		.from(equipment)
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.where(where);
	return by ? counted.groupBy(sql`${by}`) : counted;
}

/**
 * A page of the tenant's units with their owner and number of open orders, searched, filtered,
 * sorted and grouped as the URL's parameters say (`equipmentUrl`), how many match in all, and,
 * when grouped, what the table needs to know of the page's groups.
 */
export const getEquipmentList = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(equipmentTable(), params);
	const [fetched, [{ count: rowCount }], counts] = await Promise.all([
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
			.innerJoin(...tenantJoin(customer, equipment.customerId))
			.where(plan.where())
			.orderBy(...plan.orderBy)
			.limit(plan.limit)
			.offset(plan.offset),
		countEquipment(plan.where()),
		groupCounts(plan, countEquipment),
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
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
		groups: pageGroupsOf(counts, page),
	};
});

/**
 * How many units have each category, status and manufacturer, for the list's filters: of those
 * matching the search and the other filters in the URL's parameters.
 */
export const getEquipmentFacets = query(tableParams, async (params) => {
	requireMember();
	return facetCounts(
		planTable(equipmentTable(), params),
		{
			category: equipment.category,
			status: equipment.status,
			manufacturer: equipment.manufacturer,
		},
		countEquipment,
	);
});

// --- Bulk actions on the list's selected units (see `bulk-actions.ts`) -------------------------

/** The ids of the tenant's units matching the list's search and filters (`equipmentUrl`). */
async function matchingEquipmentIds(params: string, limit: number) {
	const rows = await db
		.select({ id: equipment.id })
		.from(equipment)
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.where(planTable(equipmentTable(), params).where())
		.orderBy(equipment.id)
		.limit(limit);
	return rows.map((row) => row.id);
}

/** Gives the selected units another status, e.g. decommissioned. */
export const bulkSetEquipmentStatus = command(
	v.object({ target: bulkTarget, status: v.picklist(equipmentStatuses) }),
	async ({ target, status }) => {
		requireMember();
		const result = await bulkChange(target, {
			table: equipment,
			label: equipment.serialNumber,
			columns: { status: equipment.status },
			matching: matchingEquipmentIds,
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
export const bulkDeleteEquipment = command(bulkTarget, async (target) => {
	requireMember();
	const result = await bulkChange(target, {
		table: equipment,
		label: equipment.serialNumber,
		matching: matchingEquipmentIds,
		change: (unit) => removeEquipment(unit.id),
	});
	await refreshRequested(getEquipmentList, getEquipmentFacets);
	return result;
});
