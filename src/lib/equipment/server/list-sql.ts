/**
 * The equipment list in SQL, shared by its queries and the bulk commands that act on the units
 * matching its filters (both in `equipment-list.remote.ts`). A remote file can only export remote
 * functions, so it can't export these.
 */
import { and, eq, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { openOrderStatuses } from "#lib/models.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { between, inDays, type ListSql, nocase } from "#lib/server/lists/index.ts";
import { withModuleColumns } from "#lib/server/lists/module-columns.ts";

import { equipmentList } from "../list/equipment-list.ts";

/**
 * The equipment list's joins: the unit's owner, scoped to the tenant. Written once, for the rows,
 * the counts, the facets and the bulk ids alike, and generic over the query it joins (drizzle's
 * `$dynamic()` pattern), so each keeps its own fields.
 */
export const withEquipmentJoins = <T extends SQLiteSelect>(query: T) =>
	query.innerJoin(...tenantJoin(customer, equipment.customerId));

/**
 * The equipment list's columns in SQL, checked against its definition (`equipmentList`). Call it
 * for each request, not at module scope: `inTenant()` reads the request. The columns of the
 * tenant's modules (`listColumns`) are added to it.
 */
export const equipmentSql = (): ListSql<typeof equipmentList.columns> => {
	const openOrders = sql`(select count(*) from ${order} where ${and(
		inTenant(order),
		eq(order.equipmentId, equipment.id),
		inList(order.status, openOrderStatuses),
	)})`;
	return withModuleColumns({
		list: equipmentList,
		from: (fields) => withEquipmentJoins(db.select(fields).from(equipment).$dynamic()),
		columns: {
			unit: { sort: [nocase(equipment.manufacturer), nocase(equipment.model)] },
			serialNumber: { sort: equipment.serialNumber },
			manufacturer: {
				sort: nocase(equipment.manufacturer),
				filter: (manufacturers) => inList(equipment.manufacturer, manufacturers),
				group: equipment.manufacturer,
			},
			category: {
				sort: equipment.category,
				filter: (categories) => inList(equipment.category, categories),
				group: equipment.category,
			},
			status: {
				sort: equipment.status,
				filter: (statuses) => inList(equipment.status, statuses),
				group: equipment.status,
			},
			customer: {
				sort: nocase(customer.name),
				filter: (codes) => inList(customer.code, codes),
				group: customer.code,
			},
			installedAt: {
				sort: equipment.installedAt,
				filter: (ranges) => inDays(equipment.installedAt, ranges),
			},
			warrantyUntil: {
				sort: equipment.warrantyUntil,
				filter: (ranges) => inDays(equipment.warrantyUntil, ranges),
			},
			// Counted for every unit to sort and filter by them (the page's own are counted apart).
			openOrders: {
				sort: openOrders,
				filter: (ranges) => between(openOrders, ranges),
			},
		},
		search: [
			equipment.serialNumber,
			equipment.manufacturer,
			equipment.model,
			customer.name,
			customer.code,
		],
		id: equipment.id,
		scope: () => inTenant(equipment),
	});
};
