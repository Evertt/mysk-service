import { query } from "$app/server";
import { and, count, inArray, sql } from "drizzle-orm";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { lineTotalSql, priceOrders } from "#lib/orders/server/pricing.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.ts";
import { tagOrders } from "#lib/server/modules.ts";
import { inTenant, requireMember } from "#lib/server/session.ts";
import { pageGroupsOf, planList } from "#lib/server/table-query.ts";

import { ordersSql, withOrderJoins } from "./order-list.server.ts";
import { ordersList } from "./orders-list.ts";

/**
 * A page of the orders list with their customer, equipment, engineer and totals, searched,
 * filtered, sorted and grouped as the query says (see `ordersList`), how many orders match in all,
 * and, when grouped, what the table needs to know of the page's groups.
 */
export const getOrders = query(ordersList.query, async (input) => {
	requireMember();
	const plan = planList(ordersSql(), input);
	const [rows, rowCount, counts] = await Promise.all([
		plan.paged(
			withOrderJoins(
				db
					.select({
						id: order.id,
						number: order.number,
						type: order.type,
						status: order.status,
						priority: order.priority,
						description: order.description,
						scheduledFor: order.scheduledFor,
						completedAt: order.completedAt,
						createdAt: order.createdAt,
						laborHours: order.laborHours,
						customer: { id: customer.id, code: customer.code, name: customer.name },
						equipment: {
							id: equipment.id,
							model: equipment.model,
							manufacturer: equipment.manufacturer,
							serialNumber: equipment.serialNumber,
						},
						engineer: { id: engineer.id, name: engineer.name, hourlyRate: engineer.hourlyRate },
					})
					.from(order)
					.$dynamic(),
			),
		),
		plan.count(),
		plan.groupCounts(),
	]);

	// The page's lines (only, with the rows around it when grouped), to price it.
	const ids = rows.map((row) => row.id);
	const lines = ids.length
		? await db
				.select({
					orderId: orderLine.orderId,
					count: count(),
					total: sql<number>`sum(${lineTotalSql()})`,
				})
				.from(orderLine)
				.where(and(inTenant(orderLine), inArray(orderLine.orderId, ids)))
				.groupBy(orderLine.orderId)
		: [];
	const linesOf = new Map(lines.map((line) => [line.orderId, line]));

	const page = rows.map((row) => ({
		...row,
		lineCount: linesOf.get(row.id)?.count ?? 0,
		materialsTotal: linesOf.get(row.id)?.total ?? 0,
	}));
	const facts = page.map((row) => ({
		...row,
		equipmentId: row.equipment?.id ?? null,
		materials: row.materialsTotal,
		hourlyRate: row.engineer?.hourlyRate,
	}));
	const [prices, tags] = await Promise.all([priceOrders(facts), tagOrders(facts)]);
	const priced = plan.page(
		page.map((row, i) => ({
			...row,
			laborTotal: prices[i].labor,
			total: prices[i].total,
			/** From the tenant's modules, e.g. a response time about to be missed. */
			tags: tags[i],
		})),
	);
	return {
		rows: priced.rows,
		rowCount,
		/** The query the rows are for (its `where` is the target of "select all matching"). */
		query: input,
		/** The same as a string, to tell whether the table is waiting for other rows (`isStale`). */
		key: queryKey(input),
		groups: pageGroupsOf(counts, priced),
	};
});

/**
 * How many orders have each type, status and priority, for the counts in the list's filters: of
 * those matching the search and the other filters.
 */
export const getOrderFacets = query(ordersList.where, async (where) => {
	requireMember();
	return planList(ordersSql(), where).facets({
		type: order.type,
		status: order.status,
		priority: order.priority,
	});
});
