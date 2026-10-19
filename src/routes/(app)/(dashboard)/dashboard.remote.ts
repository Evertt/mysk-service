import { and, asc, count, eq, gte, lt, min, sql } from "drizzle-orm";

import { currentDay, dayOf, mondayOf, startOfDay } from "#lib/dates.ts";
import { doneOrderStatuses, openOrderStatuses, type OrderStatus } from "#lib/models.ts";
import { priceOrders, withFirstUnit, withUnitIds } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import {
	equipmentByStatus,
	lastMonths,
	lastWeeks,
	ordersPerWeek,
	revenuePerMonth,
} from "./dashboard-charts.ts";

/**
 * Headline numbers and upcoming work for the dashboard, and what the tiles compare with the period
 * before (`trends`): the orders made in the last 7 days against the 7 before, and the revenue of the
 * last 30 days against the 30 before.
 */
export const getDashboard = forMembers.query(async () => {
	const now = Temporal.Now.instant();
	const daysAgo = (days: number) => now.subtract({ hours: days * 24 });
	const monthAgo = daysAgo(30);

	const [open] = await db
		.select({
			total: count(),
			urgent: sql<number>`sum(${order.priority} = 'urgent')`,
			unassigned: sql<number>`sum(${order.engineerId} is null)`,
		})
		.from(order)
		.where(and(inTenant(order), inList(order.status, openOrderStatuses)));
	// Reported by customers in their portal, waiting for a planner to accept or reject them.
	const [awaiting] = await db
		.select({ total: count() })
		.from(order)
		.where(and(inTenant(order), eq(order.status, "awaiting_acceptance")));

	// Work completed in the last 60 days, priced like everywhere else: the last 30 days' is the
	// tile's, the 30 before its trend's.
	const done = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				inList(order.status, doneOrderStatuses),
				gte(order.completedAt, daysAgo(60)),
			),
		);
	const prices = await priceOrders(await withUnitIds(done));
	const revenue = { total: 0, orders: 0, previous: 0 };
	for (const [i, row] of done.entries()) {
		if (Temporal.Instant.compare(row.completedAt!, monthAgo) >= 0) {
			revenue.total += prices[i].total;
			revenue.orders++;
		} else revenue.previous += prices[i].total;
	}

	// The orders made in the last 7 days, and in the 7 before.
	const madeBetween = async (from: Temporal.Instant, to?: Temporal.Instant) => {
		const [made] = await db
			.select({ total: count() })
			.from(order)
			.where(and(inTenant(order), gte(order.createdAt, from), to && lt(order.createdAt, to)));
		return made.total;
	};
	const [madeThisWeek, madeWeekBefore] = await Promise.all([
		madeBetween(daysAgo(7)),
		madeBetween(daysAgo(14), daysAgo(7)),
	]);

	const [fleet] = await db
		.select({
			total: count(),
			attention: sql<number>`sum(${equipment.status} in ('needs_service', 'out_of_service'))`,
		})
		.from(equipment)
		.where(inTenant(equipment));

	// With their first unit and how many they have, e.g. "Deur 07 +14".
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
		.limit(6)
		.then(withFirstUnit);

	return {
		open,
		awaiting: awaiting.total,
		revenue,
		made: { week: madeThisWeek, weekBefore: madeWeekBefore },
		fleet,
		upcoming,
	};
});

/**
 * The dashboard's charts (see `dashboard-charts.ts`): the orders made per week by status, the
 * revenue per month, and the equipment by status. Aggregated in the database per quarter of an hour
 * (then per week in the user's time zone) or status; the revenue per order, because `priceOrders()` applies the modules' adjustments.
 */
export const getCharts = forMembers.query(async () => {
	const today = currentDay();
	const weeks = lastWeeks(today);
	const months = lastMonths(today);

	// Counted per quarter of an hour in the database (every time zone's offset is a whole number of
	// them), then per week (its Monday, as `yyyy-mm-dd`) here: SQLite knows only the server's time
	// zone, and the weeks are the user's.
	const quarter = sql<number>`${order.createdAt} / 900`;
	const perQuarter = await db
		.select({ createdAt: min(order.createdAt), status: order.status, count: count() })
		.from(order)
		.where(and(inTenant(order), gte(order.createdAt, startOfDay(weeks[0]))))
		.groupBy(quarter, order.status);
	const counts = new Map<string, { week: string; status: OrderStatus; count: number }>();
	for (const row of perQuarter) {
		const day = dayOf(row.createdAt!);
		const week = mondayOf(day).toString();
		const key = `${week}|${row.status}`;
		const found = counts.get(key);
		if (found) found.count += row.count;
		else counts.set(key, { week, status: row.status, count: row.count });
	}
	const perWeek = [...counts.values()];

	const done = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			createdAt: order.createdAt,
			completedAt: order.completedAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(
				inTenant(order),
				inList(order.status, doneOrderStatuses),
				gte(order.completedAt, startOfDay(months[0])),
			),
		);
	const prices = await priceOrders(await withUnitIds(done));
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
