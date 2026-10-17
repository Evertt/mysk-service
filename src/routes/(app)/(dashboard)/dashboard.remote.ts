import { and, asc, count, eq, gte, min, sql } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
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

/** Headline numbers and upcoming work for the dashboard. */
export const getDashboard = forMembers.query(async () => {
	const now = Temporal.Now.instant();
	const monthAgo = now.subtract({ hours: 30 * 24 });

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

	// Work completed in the last 30 days, priced like everywhere else.
	const done = await db
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
		.where(
			and(
				inTenant(order),
				inList(order.status, doneOrderStatuses),
				gte(order.completedAt, monthAgo),
			),
		);
	const prices = await priceOrders(await withUnitIds(done));
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

	return { open, awaiting: awaiting.total, revenue, fleet, upcoming };
});

/**
 * The dashboard's charts (see `dashboard-charts.ts`): the orders made per week by status, the
 * revenue per month, and the equipment by status. Aggregated in the database per quarter of an hour
 * (then per week in the user's time zone) or status; the revenue per order, because `priceOrders()` applies the modules' adjustments.
 */
export const getCharts = forMembers.query(async () => {
	const today = Temporal.Now.plainDateISO(getTimeZone());
	const weeks = lastWeeks(today);
	const months = lastMonths(today);
	/** The moment a day starts, in the user's time zone. */
	const start = (day: Temporal.PlainDate) => day.toZonedDateTime(getTimeZone()).toInstant();

	// Counted per quarter of an hour in the database (every time zone's offset is a whole number of
	// them), then per week (its Monday, as `yyyy-mm-dd`) here: SQLite knows only the server's time
	// zone, and the weeks are the user's.
	const quarter = sql<number>`${order.createdAt} / 900`;
	const perQuarter = await db
		.select({ createdAt: min(order.createdAt), status: order.status, count: count() })
		.from(order)
		.where(and(inTenant(order), gte(order.createdAt, start(weeks[0]))))
		.groupBy(quarter, order.status);
	const counts = new Map<string, { week: string; status: OrderStatus; count: number }>();
	for (const row of perQuarter) {
		const day = row.createdAt!.toZonedDateTimeISO(getTimeZone()).toPlainDate();
		const week = day.subtract({ days: day.dayOfWeek - 1 }).toString();
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
				gte(order.completedAt, start(months[0])),
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
