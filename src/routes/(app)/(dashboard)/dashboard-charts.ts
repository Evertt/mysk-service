/**
 * The dashboard's charts: the periods they cover and how the aggregated rows fill them (a period
 * without orders is a zero, not a missing bar). Isomorphic: `dashboard.remote.ts` shapes its SQL
 * results with these, the chart components take the result.
 */
import { dayOf, mondayOf } from "#lib/dates.ts";
import {
	type EquipmentStatus,
	equipmentStatuses,
	type OrderStatus,
	orderStatuses,
} from "#lib/models.ts";

/** How far back the charts look: this week or month, and the ones before it. */
const WEEKS = 12;
const MONTHS = 12;

/** The Mondays of the last `count` weeks up to and including `today`'s, oldest first. */
export function lastWeeks(today: Temporal.PlainDate, count = WEEKS) {
	const monday = mondayOf(today);
	return Array.from({ length: count }, (_, i) => monday.subtract({ weeks: count - 1 - i }));
}

/** The first days of the last `count` months up to and including `today`'s, oldest first. */
export function lastMonths(today: Temporal.PlainDate, count = MONTHS) {
	const first = today.with({ day: 1 });
	return Array.from({ length: count }, (_, i) => first.subtract({ months: count - 1 - i }));
}

/** The orders made in a week (by its Monday), by their status now: a stacked bar. */
export type OrdersInWeek = { week: Temporal.PlainDate } & Record<OrderStatus, number>;

/**
 * Lays the counts per week and status (the week as its Monday, `yyyy-mm-dd` in the user's time zone) over `weeks`, with zeroes where nothing happened.
 */
export function ordersPerWeek(
	rows: { week: string; status: OrderStatus; count: number }[],
	weeks: Temporal.PlainDate[],
): OrdersInWeek[] {
	const byWeek = new Map(
		weeks.map((week) => [
			week.toString(),
			{ week, ...Object.fromEntries(orderStatuses.map((status) => [status, 0])) } as OrdersInWeek,
		]),
	);
	for (const row of rows) {
		const entry = byWeek.get(row.week);
		if (entry) entry[row.status] += row.count;
	}
	return [...byWeek.values()];
}

/** The work completed in a month: its priced total (cents) and how many orders. */
export interface RevenueInMonth {
	/** Its first day. */
	month: Temporal.PlainDate;
	total: number;
	orders: number;
}

/** Adds the priced orders up per month of completion, over `months`, with zeroes where none were. */
export function revenuePerMonth(
	orders: { completedAt: Temporal.Instant; total: number }[],
	months: Temporal.PlainDate[],
): RevenueInMonth[] {
	const byMonth = new Map(
		months.map((month) => [month.toString(), { month, total: 0, orders: 0 }]),
	);
	for (const order of orders) {
		// The month it was completed in, in the user's time zone.
		const day = dayOf(order.completedAt);
		const entry = byMonth.get(day.with({ day: 1 }).toString());
		if (entry) {
			entry.total += order.total;
			entry.orders += 1;
		}
	}
	return [...byMonth.values()];
}

export interface EquipmentOfStatus {
	status: EquipmentStatus;
	count: number;
}

/** The count per status in the order of the enum, zero for a status without units. */
export const equipmentByStatus = (
	rows: { status: EquipmentStatus; count: number }[],
): EquipmentOfStatus[] =>
	equipmentStatuses.map((status) => ({
		status,
		count: rows.find((row) => row.status === status)?.count ?? 0,
	}));
