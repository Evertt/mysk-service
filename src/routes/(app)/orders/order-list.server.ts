/**
 * The orders list in SQL, shared by its queries (`order-list.remote.ts`) and the bulk commands that
 * act on the orders matching its filters (`order-bulk.remote.ts`). A remote file can only export
 * remote functions, so it can't be shared from there.
 */
import { inArray } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { orderPriorities } from "#lib/models.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/session.ts";
import { anyOf, type ListSql, nocase, rank } from "#lib/server/table-query.ts";

import { ordersList } from "./orders-list.ts";

/**
 * The orders list's joins: the order's customer, unit and engineer, each scoped to the tenant.
 * Written once, for the rows, the counts, the facets and the bulk ids alike, and generic over the
 * query it joins (drizzle's `$dynamic()` pattern), so each keeps its own fields.
 */
export const withOrderJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(customer, order.customerId))
		.leftJoin(...tenantJoin(equipment, order.equipmentId))
		.leftJoin(...tenantJoin(engineer, order.engineerId));

/**
 * The orders list's columns in SQL, checked against its definition (`ordersList`). Call it for
 * each request, not at module scope: `inTenant()` reads the request.
 */
export const ordersSql = (): ListSql<typeof ordersList.columns> => ({
	list: ordersList,
	from: (fields) => withOrderJoins(db.select(fields).from(order).$dynamic()),
	columns: {
		number: { sort: order.number },
		customer: {
			sort: nocase(customer.name),
			filter: (codes) => inArray(customer.code, codes),
			group: customer.code,
		},
		equipment: {
			sort: [nocase(equipment.manufacturer), nocase(equipment.model)],
			nullsLast: true,
			// `null` among the serial numbers: the new installations.
			filter: (serials) => anyOf(equipment.serialNumber, serials),
		},
		type: {
			sort: order.type,
			filter: (types) => inArray(order.type, types),
			group: order.type,
		},
		status: {
			sort: order.status,
			filter: (statuses) => inArray(order.status, statuses),
			group: order.status,
		},
		// By urgency rather than alphabetically.
		priority: {
			sort: rank(order.priority, orderPriorities),
			filter: (priorities) => inArray(order.priority, priorities),
			group: order.priority,
		},
		engineer: {
			sort: nocase(engineer.name),
			nullsLast: true,
			// `null` among the ids: the unassigned orders.
			filter: (ids) => anyOf(order.engineerId, ids),
			group: order.engineerId,
		},
		scheduledFor: { sort: order.scheduledFor, nullsLast: true },
		createdAt: { sort: order.createdAt },
	},
	search: [
		order.number,
		customer.name,
		customer.code,
		equipment.manufacturer,
		equipment.model,
		equipment.serialNumber,
		engineer.name,
	],
	id: order.id,
	scope: () => inTenant(order),
});
