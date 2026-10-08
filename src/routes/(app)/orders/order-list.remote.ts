import { query } from "$app/server";
import { and, count, eq, inArray, sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.js";
import { tagOrders } from "#lib/server/modules.js";
import { priceOrders } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import {
	facetCounts,
	groupCounts,
	pageGroupsOf,
	planTable,
	tableParams,
} from "#lib/server/table-query.js";

import { countOrders, ordersTable } from "./order-list.server.js";

/**
 * A page of the orders list with their customer, equipment, engineer and totals, searched,
 * filtered, sorted and grouped as the URL's parameters say (`ordersUrl`, e.g.
 * `status=quote&page=2`), how many orders match in all, and, when grouped, what the table needs to
 * know of the page's groups.
 */
export const getOrders = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(ordersTable, params);
	const [rows, [{ count: rowCount }], counts] = await Promise.all([
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
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
			.leftJoin(equipment, and(eq(order.equipmentId, equipment.id), inTenant(equipment)))
			.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
			.where(plan.where())
			.orderBy(...plan.orderBy)
			.limit(plan.limit)
			.offset(plan.offset),
		countOrders(plan.where()),
		groupCounts(plan, countOrders),
	]);

	// The page's lines (only, with the rows around it when grouped), to price it.
	const ids = rows.map((row) => row.id);
	const lines = ids.length
		? await db
				.select({
					orderId: orderLine.orderId,
					count: count(),
					total: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`,
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
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
		groups: pageGroupsOf(counts, priced),
	};
});

/**
 * How many orders have each type, status and priority, for the counts in the list's filters: of
 * those matching the search and the other filters in the URL's parameters.
 */
export const getOrderFacets = query(tableParams, async (params) => {
	requireMember();
	return facetCounts(
		planTable(ordersTable, params),
		{ type: order.type, status: order.status, priority: order.priority },
		countOrders,
	);
});
