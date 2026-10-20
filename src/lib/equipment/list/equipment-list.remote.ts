import { and, count } from "drizzle-orm";
import * as v from "valibot";

import { equipmentSubject } from "#lib/activity/index.ts";
import { equipmentStatuses, openOrderStatuses } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";
import {
	bulkChange,
	customerRecords,
	facetOptions,
	facetOptionsInput,
	listTarget,
	refreshRequested,
	moduleFacets,
	moduleValues,
	planList,
} from "#lib/server/lists/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { removeEquipment } from "../server/equipment.ts";
import {
	equipmentSql,
	locationRecords,
	manufacturerOrNone,
	withEquipmentJoins,
} from "../server/list-sql.ts";
import { equipmentList } from "./equipment-list.ts";

/**
 * A page of the tenant's units with their owner and number of open orders, searched, filtered,
 * sorted and grouped as the query says (see `equipmentList`), how many match in all, and, when
 * grouped, what the table needs to know of the page's groups.
 */
export const getEquipmentList = forMembers.query(equipmentList.query, (input) => {
	const listSql = equipmentSql();
	return planList(listSql, input).answer(
		withEquipmentJoins(
			db
				.select({
					id: equipment.id,
					serialNumber: equipment.serialNumber,
					name: equipment.name,
					manufacturer: equipment.manufacturer,
					model: equipment.model,
					location: { id: equipmentLocation.id, name: equipmentLocation.name },
					category: { id: equipmentCategory.id, name: equipmentCategory.name },
					status: equipment.status,
					installedAt: equipment.installedAt,
					warrantyUntil: equipment.warrantyUntil,
					customer: { id: customer.id, code: customer.code, name: customer.name },
					site: { id: customerSite.id, name: customerSite.name, city: customerSite.city },
				})
				.from(equipment)
				.$dynamic(),
		),
		{
			// The page's open orders (only), and what the tenant's modules' columns show for them,
			// e.g. the next maintenance.
			enrich: async (rows) => {
				const ids = rows.map((row) => row.id);
				const [open, valuesOf] = await Promise.all([
					ids.length
						? db
								.select({ equipmentId: orderUnit.equipmentId, count: count() })
								.from(orderUnit)
								.innerJoin(...tenantJoin(order, orderUnit.orderId))
								.where(
									and(
										inTenant(orderUnit),
										inList(orderUnit.equipmentId, ids),
										inList(order.status, openOrderStatuses),
									),
								)
								.groupBy(orderUnit.equipmentId)
						: [],
					moduleValues(listSql, ids),
				]);
				const openOf = new Map(open.map((row) => [row.equipmentId, row.count]));
				return rows.map((row) => ({
					...row,
					openOrders: openOf.get(row.id) ?? 0,
					moduleValues: valuesOf.get(row.id) ?? {},
				}));
			},
		},
	);
});

/**
 * How many units have each category, status and manufacturer (those without one under `none`), for
 * the list's filters: of those matching the search and the other filters. The filters on customers
 * and locations count theirs with their options (below).
 */
export const getEquipmentFacets = forMembers.query(equipmentList.where, async (where) => {
	const listSql = equipmentSql();
	const counts = await planList(listSql, where).facets({
		category: equipment.categoryId,
		status: equipment.status,
		manufacturer: manufacturerOrNone,
		// And the tenant's modules' columns, by their ids (the type names the list's own only).
		...(moduleFacets(listSql) as Record<never, never>),
	});
	return counts as typeof counts & { readonly [moduleColumn: string]: Record<string, number> };
});

// The options of the list's filters on related records, each with how many units have it under
// the list's search and other filters, most first (see `facetOptions()`).
const optionsInput = facetOptionsInput(equipmentList);

/** Customers by name or code; their code is the filter's value (`?customer=CUST-0001`). */
export const getEquipmentCustomerOptions = forMembers.query(optionsInput, (input) =>
	facetOptions(equipmentSql(), input, "customer", customerRecords(), { by: customer.code }),
);

/**
 * Locations by their name, their site's or their customer's, and the units without one; their id
 * is the filter's value (`?location=12`).
 */
export const getEquipmentLocationOptions = forMembers.query(optionsInput, (input) =>
	facetOptions(equipmentSql(), input, "location", locationRecords(), {
		by: equipment.locationId,
		none: true,
	}),
);

// --- Bulk actions on the list's selected units (see `bulk-actions.ts`) -------------------------

/** The selected units, or all those matching the list's search and filters. */
const equipmentTarget = listTarget(equipmentList.where);

/** Gives the selected units another status, e.g. decommissioned. */
export const bulkSetEquipmentStatus = forMembers.command(
	v.object({ target: equipmentTarget, status: v.picklist(equipmentStatuses) }),
	async ({ target, status }) => {
		const result = await bulkChange(target, {
			table: equipment,
			label: equipment.serialNumber,
			columns: { status: equipment.status, serialNumber: equipment.serialNumber },
			list: equipmentSql,
			change: (unit) =>
				db.transaction(async (tx) => {
					if (unit.status === status) return;
					await tx.update(equipment).set({ status }).where(idInTenant(equipment, unit.id));
					const subject = equipmentSubject(unit);
					await recordActivity(tx, { action: "updated", subject, before: unit, after: { status } });
				}),
		});
		await refreshRequested(getEquipmentList, getEquipmentFacets);
		return result;
	},
);

/** Deletes the selected units, with the same refusals as deleting one. */
export const bulkDeleteEquipment = forMembers.command(equipmentTarget, async (target) => {
	const result = await bulkChange(target, {
		table: equipment,
		label: equipment.serialNumber,
		list: equipmentSql,
		change: (unit) => removeEquipment(unit.id),
	});
	await refreshRequested(getEquipmentList, getEquipmentFacets);
	return result;
});
