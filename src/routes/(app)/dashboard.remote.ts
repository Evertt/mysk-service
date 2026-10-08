import { query } from "$app/server";
import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";

import { DAY } from "#lib/dates.js";
import { stockLevel } from "#lib/materials/display.js";
import { doneOrderStatuses, openOrderStatuses } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, material, order } from "#lib/server/db/schema.js";
import { materialsPerOrder, priceOrders } from "#lib/server/pricing.js";
import { inTenant, requireMember, tenantJoin } from "#lib/server/session.js";

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

	const materials = materialsPerOrder();

	// Work completed in the last 30 days, priced like everywhere else.
	const done = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
			materials: sql<number>`coalesce(${materials.total}, 0)`,
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				inArray(order.status, doneOrderStatuses),
				gte(order.completedAt, monthAgo),
			),
		);
	const prices = await priceOrders(done);
	const revenue = {
		total: prices.reduce((sum, price) => sum + price.total, 0),
		orders: done.length,
	};

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
		.innerJoin(...tenantJoin(customer, order.customerId))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(inTenant(order), eq(order.status, "scheduled"), gte(order.scheduledFor, now)))
		.orderBy(asc(order.scheduledFor))
		.limit(6);

	// Materials running low or out, by the same levels as the materials list.
	const levels = (
		await db
			.select({ stock: material.stock, unit: material.unit })
			.from(material)
			.where(inTenant(material))
	).map((row) => stockLevel(row.stock, row.unit));
	const stock = {
		low: levels.filter((level) => level === "low").length,
		out: levels.filter((level) => level === "out").length,
		total: levels.length,
	};

	return { open, revenue, fleet, upcoming, stock };
});
