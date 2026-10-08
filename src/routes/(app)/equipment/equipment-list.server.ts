/**
 * The equipment list in SQL, shared by its queries and the bulk commands that act on the units
 * matching its filters (both in `equipment-list.remote.ts`). A remote file can only export remote
 * functions, so it can't export these.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { openOrderStatuses } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { inTenant, tenantJoin } from "#lib/server/session.js";
import { type ListSql, nocase } from "#lib/server/table-query.js";

import { equipmentList } from "./equipment-list.js";

/**
 * The equipment list's joins: the unit's owner, scoped to the tenant. Written once, for the rows,
 * the counts, the facets and the bulk ids alike, and generic over the query it joins (drizzle's
 * `$dynamic()` pattern), so each keeps its own fields.
 */
export const withEquipmentJoins = <T extends SQLiteSelect>(query: T) =>
	query.innerJoin(...tenantJoin(customer, equipment.customerId));

/**
 * The equipment list's columns in SQL, checked against its definition (`equipmentList`). Call it
 * for each request, not at module scope: `inTenant()` reads the request.
 */
export const equipmentSql = (): ListSql<typeof equipmentList.columns> => ({
	list: equipmentList,
	from: (fields) => withEquipmentJoins(db.select(fields).from(equipment).$dynamic()),
	columns: {
		unit: { sort: [nocase(equipment.manufacturer), nocase(equipment.model)] },
		serialNumber: { sort: equipment.serialNumber },
		manufacturer: {
			sort: nocase(equipment.manufacturer),
			filter: (manufacturers) => inArray(equipment.manufacturer, manufacturers),
			group: equipment.manufacturer,
		},
		category: {
			sort: equipment.category,
			filter: (categories) => inArray(equipment.category, categories),
			group: equipment.category,
		},
		status: {
			sort: equipment.status,
			filter: (statuses) => inArray(equipment.status, statuses),
			group: equipment.status,
		},
		customer: {
			sort: nocase(customer.name),
			filter: (codes) => inArray(customer.code, codes),
			group: customer.code,
		},
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
	id: equipment.id,
	scope: () => inTenant(equipment),
});
