import { query } from "$app/server";
import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";

import { doneOrderStatuses, openOrderStatuses } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.js";
import { STANDARD_HOURLY_RATE } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";

const DAY = 24 * 60 * 60 * 1000;

/** Headline numbers and upcoming work for the dashboard. */
export const getDashboard = query(async () => {
	requireMember();

	const now = new Date();
	const monthAgo = new Date(now.getTime() - 30 * DAY);

	const [open] = await db
		.select({
			total: count(),
			urgent: sql<number>`sum(${order.priority} = 'urgent')`,
			unassigned: sql<number>`sum(${order.engineerId} is null)`,
		})
		.from(order)
		.where(and(inTenant(order), inArray(order.status, openOrderStatuses)));

	const materials = db
		.select({
			orderId: orderLine.orderId,
			total: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`.as("total"),
		})
		.from(orderLine)
		.where(inTenant(orderLine))
		.groupBy(orderLine.orderId)
		.as("materials");

	// Materials plus labour at the engineer's rate, for work completed in the last 30 days.
	const [revenue] = await db
		.select({
			total: sql<number>`coalesce(sum(coalesce(${materials.total}, 0) + ${order.laborHours} * coalesce(${engineer.hourlyRate}, ${STANDARD_HOURLY_RATE})), 0)`,
			orders: count(),
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(
			and(
				inTenant(order),
				inArray(order.status, doneOrderStatuses),
				gte(order.completedAt, monthAgo),
			),
		);

	const [fleet] = await db
		.select({
			total: count(),
			attention: sql<number>`sum(${equipment.status} in ('needs_service', 'out_of_service'))`,
		})
		.from(equipment)
		.where(inTenant(equipment));

	const upcoming = await db
		.select({
			id: order.id,
			number: order.number,
			priority: order.priority,
			scheduledFor: order.scheduledFor,
			customer: { code: customer.code, name: customer.name },
			engineer: { id: engineer.id, name: engineer.name },
		})
		.from(order)
		.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
		.leftJoin(engineer, and(eq(order.engineerId, engineer.id), inTenant(engineer)))
		.where(and(inTenant(order), eq(order.status, "scheduled"), gte(order.scheduledFor, now)))
		.orderBy(asc(order.scheduledFor))
		.limit(6);

	return { open, revenue, fleet, upcoming };
});
