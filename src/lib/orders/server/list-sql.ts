/**
 * The orders list in SQL, shared by its queries (`order-list.remote.ts`) and the bulk commands that
 * act on the orders matching its filters (`order-bulk.remote.ts`). A remote file can only export
 * remote functions, so it can't be shared from there.
 */
import { and, countDistinct, eq, exists, notExists, or, sql, type SQL } from "drizzle-orm";
import { alias, type SQLiteSelect } from "drizzle-orm/sqlite-core";

import { type NumberRange, numberInRange } from "#lib/components/data-table/ranges.ts";
import { noneToken } from "#lib/components/data-table/url-state.ts";
import { orderPriorities } from "#lib/models.ts";
import { idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import {
	anyOf,
	inDays,
	type ListSql,
	type ListWherePlan,
	nocase,
	rank,
} from "#lib/server/lists/index.ts";

import { ordersList } from "../list/orders-list.ts";
import { priceOrders } from "./pricing.ts";
import { withUnitIds } from "./units.ts";

/**
 * The orders list's joins: the order's customer, its first unit (`equipment`, what the list shows
 * and sorts by; the others are asked separately, `anyUnit`) and its engineer, each scoped to the
 * tenant. Written once, for the rows, the counts, the facets and the bulk ids alike, and generic
 * over the query it joins (drizzle's `$dynamic()` pattern), so each keeps its own fields.
 */
export const withOrderJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(customer, order.customerId))
		.leftJoin(
			orderUnit,
			and(eq(orderUnit.orderId, order.id), eq(orderUnit.position, 0), inTenant(orderUnit)),
		)
		.leftJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.leftJoin(...tenantJoin(engineer, order.engineerId));

/** Any of an order's units, apart from the first one the list joins. */
const anyLink = alias(orderUnit, "any_order_unit");
const anyUnit = alias(equipment, "any_unit");

/**
 * The order's units (those for which `condition` holds, on `anyUnit`), for a correlated subquery on
 * the list's `order`.
 */
const unitsOfOrder = <T extends SQLiteSelect>(query: T, condition?: SQL) =>
	query
		.innerJoin(anyUnit, and(eq(anyUnit.id, anyLink.equipmentId), inTenant(anyUnit)))
		.where(and(eq(anyLink.orderId, order.id), inTenant(anyLink), condition));

/**
 * Whether any of the order's units has one of the serial numbers, or (`null` among them) the order
 * has no units: the new installations.
 */
function withUnitIn(serials: readonly (string | null)[]) {
	const some = serials.filter((serial) => serial !== null);
	const subquery = () =>
		db
			.select({ one: sql`1` })
			.from(anyLink)
			.$dynamic();
	return or(
		...(some.length ? [exists(unitsOfOrder(subquery(), inList(anyUnit.serialNumber, some)))] : []),
		...(some.length < serials.length
			? [notExists(subquery().where(and(eq(anyLink.orderId, order.id), inTenant(anyLink))))]
			: []),
	);
}

/** What the search finds an order by of its units: each one's make, model, serial and name. */
const unitsText = () =>
	sql`(${unitsOfOrder(
		db
			.select({
				text: sql`group_concat(${anyUnit.manufacturer} || ' ' || ${anyUnit.model} || ' ' || ${anyUnit.serialNumber} || ' ' || coalesce(${anyUnit.name}, ''), ' ')`,
			})
			.from(anyLink)
			.$dynamic(),
	)})`;

/**
 * How many orders have each unit (by serial number) among their units, for the counts in the
 * list's filter by unit: of those matching the search and the other filters, an order counted for
 * each of its units; those without units under `null`.
 */
export async function unitFacets(plan: ListWherePlan<typeof ordersList.columns>) {
	const where = await plan.where("equipment");
	const rows = await withOrderJoins(
		db
			.select({ value: anyUnit.serialNumber, count: countDistinct(order.id) })
			.from(order)
			.$dynamic(),
	)
		.leftJoin(anyLink, and(eq(anyLink.orderId, order.id), inTenant(anyLink)))
		.leftJoin(anyUnit, and(eq(anyUnit.id, anyLink.equipmentId), inTenant(anyUnit)))
		.where(where)
		.groupBy(anyUnit.serialNumber);
	return Object.fromEntries(rows.map((row) => [row.value ?? noneToken, row.count]));
}

/**
 * Of the orders `ids`, those whose total is in any of `ranges` (in cents). A total isn't in the
 * database: it's what `priceOrders()` makes of the order with the tenant's modules (materials'
 * costs, what a contract includes), as the list shows it, so it's priced here the same way, from
 * the same facts as the list's rows, rather than worked out again in SQL.
 */
async function withTotalIn(ranges: readonly (NumberRange | null)[], ids: number[]) {
	if (!ids.length) return [];
	const orders = await withUnitIds(
		await db
			.select({
				id: order.id,
				type: order.type,
				status: order.status,
				createdAt: order.createdAt,
				laborHours: order.laborHours,
				hourlyRate: engineer.hourlyRate,
			})
			.from(order)
			.leftJoin(...tenantJoin(engineer, order.engineerId))
			.where(idsInTenant(order, ids)),
	);
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
		// By the first unit, as the column shows it (its name, or its manufacturer and model, as the
		// equipment list sorts); any of the units' serial numbers filters.
		equipment: {
			sort: [
				nocase(sql`coalesce(${equipment.name}, ${equipment.manufacturer})`),
				nocase(equipment.model),
			],
			nullsLast: true,
			// `null` among the serial numbers: the new installations.
			filter: withUnitIn,
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
	search: [order.number, customer.name, customer.code, unitsText(), engineer.name],
	id: order.id,
	scope: () => inTenant(order),
});
