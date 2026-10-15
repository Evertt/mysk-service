/**
 * The orders list in SQL, shared by its queries (`order-list.remote.ts`) and the bulk commands that
 * act on the orders matching its filters (`order-bulk.remote.ts`). A remote file can only export
 * remote functions, so it can't be shared from there.
 */
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { type NumberRange, numberInRange } from "#lib/components/data-table/ranges.ts";
import { orderPriorities } from "#lib/models.ts";
import { idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { anyOf, inDays, type ListSql, nocase, rank } from "#lib/server/lists/index.ts";

import { ordersList } from "../list/orders-list.ts";
import { priceOrders } from "./pricing.ts";

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
 * Of the orders `ids`, those whose total is in any of `ranges` (in cents). A total isn't in the
 * database: it's what `priceOrders()` makes of the order with the tenant's modules (materials'
 * costs, what a contract includes), as the list shows it, so it's priced here the same way, from
 * the same facts as the list's rows, rather than worked out again in SQL.
 */
async function withTotalIn(ranges: readonly (NumberRange | null)[], ids: number[]) {
	if (!ids.length) return [];
	const orders = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(idsInTenant(order, ids));
	const prices = await priceOrders(orders);
	return orders
		.filter((_, i) => ranges.some((range) => range && numberInRange(prices[i].total, range)))
		.map((row) => row.id);
}

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
			filter: (codes) => inList(customer.code, codes),
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
			filter: (types) => inList(order.type, types),
			group: order.type,
		},
		status: {
			sort: order.status,
			filter: (statuses) => inList(order.status, statuses),
			group: order.status,
		},
		// By urgency rather than alphabetically.
		priority: {
			sort: rank(order.priority, orderPriorities),
			filter: (priorities) => inList(order.priority, priorities),
			group: order.priority,
		},
		engineer: {
			sort: nocase(engineer.name),
			nullsLast: true,
			// `null` among the ids: the unassigned orders.
			filter: (ids) => anyOf(order.engineerId, ids),
			group: order.engineerId,
		},
		scheduledFor: {
			sort: order.scheduledFor,
			nullsLast: true,
			filter: (ranges) => inDays(order.scheduledFor, ranges),
		},
		createdAt: { sort: order.createdAt, filter: (ranges) => inDays(order.createdAt, ranges) },
		total: { match: withTotalIn },
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
