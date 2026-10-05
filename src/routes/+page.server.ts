import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.js";

import type { PageServerLoad } from "./$types";

const DAY = 24 * 60 * 60 * 1000;
const openStatuses = ["quote", "scheduled", "in_progress"] as const;

export const load: PageServerLoad = async () => {
	const now = new Date();
	const monthAgo = new Date(now.getTime() - 30 * DAY);

	const [open] = await db
		.select({
			total: count(),
			urgent: sql<number>`sum(${order.priority} = 'urgent')`,
			unassigned: sql<number>`sum(${order.engineerId} is null)`,
		})
		.from(order)
		.where(inArray(order.status, openStatuses));

	const materials = db
		.select({
			orderId: orderLine.orderId,
			total: sql<number>`sum(${orderLine.quantity} * ${orderLine.unitPrice})`.as("total"),
		})
		.from(orderLine)
		.groupBy(orderLine.orderId)
		.as("materials");

	// Materials plus labour at the engineer's rate, for work completed in the last 30 days.
	const [revenue] = await db
		.select({
			total: sql<number>`coalesce(sum(coalesce(${materials.total}, 0) + ${order.laborHours} * coalesce(${engineer.hourlyRate}, 8500)), 0)`,
			orders: count(),
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(engineer, eq(order.engineerId, engineer.id))
		.where(and(inArray(order.status, ["completed", "invoiced"]), gte(order.completedAt, monthAgo)));

	const [fleet] = await db
		.select({
			total: count(),
			attention: sql<number>`sum(${equipment.status} in ('needs_service', 'out_of_service'))`,
		})
		.from(equipment);

	const upcoming = await db
		.select({
			id: order.id,
			number: order.number,
			priority: order.priority,
			scheduledFor: order.scheduledFor,
			customer: customer.name,
			engineer: engineer.name,
		})
		.from(order)
		.innerJoin(customer, eq(order.customerId, customer.id))
		.leftJoin(engineer, eq(order.engineerId, engineer.id))
		.where(and(eq(order.status, "scheduled"), gte(order.scheduledFor, now)))
		.orderBy(asc(order.scheduledFor))
		.limit(6);

	return { open, revenue, fleet, upcoming };
};
