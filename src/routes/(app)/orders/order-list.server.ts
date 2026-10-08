/**
 * The orders list in SQL, shared by its queries (`order-list.remote.ts`) and the bulk commands that
 * act on the orders matching its URL (`order-bulk.remote.ts`). A remote file can only export remote
 * functions, so it can't be shared from there.
 */
import { and, count, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";

import { orderPriorities } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.js";
import { inTenant } from "#lib/server/session.js";
import { nocase, oneOf, planTable, rank, type ServerTable } from "#lib/server/table-query.js";

import { ordersUrl } from "./orders-url.js";

/** The orders list's columns in SQL, for its URL state (`ordersUrl`). */
export const ordersTable: ServerTable = {
	spec: ordersUrl,
	columns: {
		number: { sort: order.number },
		customer: { sort: nocase(customer.name), filter: oneOf(customer.code), group: customer.code },
		equipment: {
			sort: [nocase(equipment.manufacturer), nocase(equipment.model)],
			nullsLast: true,
			filter: oneOf(equipment.serialNumber),
		},
		type: { sort: order.type, filter: oneOf(order.type), group: order.type },
		status: { sort: order.status, filter: oneOf(order.status), group: order.status },
		// By urgency rather than alphabetically.
		priority: {
			sort: rank(order.priority, orderPriorities),
			filter: oneOf(order.priority),
			group: order.priority,
		},
		engineer: {
			sort: nocase(engineer.name),
			nullsLast: true,
			filter: (ids) => inArray(order.engineerId, ids.map(Number).filter(Number.isSafeInteger)),
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
	tieBreaker: order.id,
	scope: () => inTenant(order),
};

/**
 * How many orders match `where` (with their customer, unit and engineer, as in the list): in all,
 * or per value of `by`.
 */
export function countOrders(where: SQL | undefined, by?: SQLWrapper) {
	const counted = db
		.select({ value: sql<unknown>`${by ?? sql`null`}`, count: count() })
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(where);
	return by ? counted.groupBy(sql`${by}`) : counted;
}

/** The ids of the tenant's orders matching the list's search and filters (`ordersUrl`). */
export async function matchingOrderIds(params: string, limit: number) {
	const rows = await db
		.select({ id: order.id })
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(planTable(ordersTable, params).where())
		.orderBy(order.id)
		.limit(limit);
	return rows.map((row) => row.id);
}
