import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";

import { DAY } from "#lib/dates.ts";
import { stockLevel } from "#lib/materials/display.ts";
import { doneOrderStatuses, openOrderStatuses } from "#lib/models.ts";
import { materialsPerOrder, priceOrders } from "#lib/orders/server/pricing.ts";
import { inTenant, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, material, order } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import {
	equipmentByStatus,
	lastMonths,
	lastWeeks,
	ordersPerWeek,
	revenuePerMonth,
} from "./dashboard-charts.ts";

/** Headline numbers and upcoming work for the dashboard. */
export const getDashboard = forMembers.query(async () => {
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

/**
 * The dashboard's charts (see `dashboard-charts.ts`): the orders made per week by status, the
 * revenue per month, and the equipment by status. Aggregated in the database per local week or
 * status; the revenue per order, because `priceOrders()` applies the modules' adjustments.
 */
export const getCharts = forMembers.query(async () => {
	const now = new Date();
	const weeks = lastWeeks(now);
	const months = lastMonths(now);

	// The Monday of the order's week, in local time (`-6 days` then on to the next Monday, which is
	// the day itself for a Monday), as `yyyy-mm-dd`: what `toDateInput(startOfWeek())` gives.
	const week = sql<string>`date(${order.createdAt}, 'unixepoch', 'localtime', '-6 days', 'weekday 1')`;
	const perWeek = await db
		.select({ week, status: order.status, count: count() })
		.from(order)
		.where(and(inTenant(order), gte(order.createdAt, weeks[0])))
		.groupBy(week, order.status);

	const materials = materialsPerOrder();
	const done = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
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
				gte(order.completedAt, months[0]),
			),
		);
	const prices = await priceOrders(done);
	const completed = done.map((row, i) => ({
		completedAt: row.completedAt!,
		total: prices[i].total,
	}));

	const fleet = await db
		.select({ status: equipment.status, count: count() })
		.from(equipment)
		.where(inTenant(equipment))
		.groupBy(equipment.status);

	return {
		ordersPerWeek: ordersPerWeek(perWeek, weeks),
		revenuePerMonth: revenuePerMonth(completed, months),
		equipmentByStatus: equipmentByStatus(fleet),
	};
});
