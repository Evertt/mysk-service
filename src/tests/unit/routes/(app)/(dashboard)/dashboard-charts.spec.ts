import { describe, expect, test } from "vite-plus/test";

import {
	equipmentByStatus,
	lastMonths,
	lastWeeks,
	ordersPerWeek,
	revenuePerMonth,
} from "#routes/(app)/(dashboard)/dashboard-charts.ts";
import { at, day } from "#unit/temporal-support.ts";

// A Wednesday.
const now = day("2026-10-07");

describe("lastWeeks", () => {
	test("are the Mondays up to this week's, oldest first", () => {
		expect(lastWeeks(now, 3)).toEqual([day("2026-09-21"), day("2026-09-28"), day("2026-10-05")]);
	});

	test("cover twelve weeks by default", () => {
		const weeks = lastWeeks(now);
		expect(weeks).toHaveLength(12);
		expect(weeks[0]).toEqual(day("2026-07-20"));
		expect(weeks.at(-1)).toEqual(day("2026-10-05"));
	});
});

describe("lastMonths", () => {
	test("are the first days up to this month's, oldest first, across a year", () => {
		expect(lastMonths(now, 3)).toEqual([day("2026-08-01"), day("2026-09-01"), day("2026-10-01")]);
		expect(lastMonths(day("2026-01-15"), 2)).toEqual([day("2025-12-01"), day("2026-01-01")]);
		expect(lastMonths(now)).toHaveLength(12);
	});
});

describe("ordersPerWeek", () => {
	const weeks = lastWeeks(now, 2);

	test("fills every week and status, adding up what the rows say", () => {
		const result = ordersPerWeek(
			[
				{ week: "2026-10-05", status: "quote", count: 2 },
				{ week: "2026-10-05", status: "scheduled", count: 3 },
				{ week: "2026-09-28", status: "invoiced", count: 1 },
			],
			weeks,
		);

		expect(result).toEqual([
			{
				week: day("2026-09-28"),
				quote: 0,
				scheduled: 0,
				in_progress: 0,
				completed: 0,
				invoiced: 1,
				cancelled: 0,
			},
			{
				week: day("2026-10-05"),
				quote: 2,
				scheduled: 3,
				in_progress: 0,
				completed: 0,
				invoiced: 0,
				cancelled: 0,
			},
		]);
	});

	test("leaves out weeks before the period", () => {
		const result = ordersPerWeek([{ week: "2026-09-21", status: "quote", count: 9 }], weeks);

		expect(result.map((week) => week.quote)).toEqual([0, 0]);
	});
});

describe("revenuePerMonth", () => {
	const months = lastMonths(now, 3);

	test("adds the orders up by the month they were completed in", () => {
		const result = revenuePerMonth(
			[
				{ completedAt: at("2026-10-02 09:00"), total: 10_000 },
				{ completedAt: at("2026-10-06 17:00"), total: 2_550 },
				{ completedAt: at("2026-08-31 23:59"), total: 700 },
			],
			months,
		);

		expect(result).toEqual([
			{ month: day("2026-08-01"), total: 700, orders: 1 },
			{ month: day("2026-09-01"), total: 0, orders: 0 },
			{ month: day("2026-10-01"), total: 12_550, orders: 2 },
		]);
	});

	test("leaves out orders completed before the period", () => {
		const result = revenuePerMonth([{ completedAt: at("2026-07-31 00:00"), total: 500 }], months);

		expect(result.map((month) => month.total)).toEqual([0, 0, 0]);
	});
});

test("equipmentByStatus lists every status in order, zero when there are no units", () => {
	expect(
		equipmentByStatus([
			{ status: "out_of_service", count: 2 },
			{ status: "operational", count: 40 },
		]),
	).toEqual([
		{ status: "operational", count: 40 },
		{ status: "needs_service", count: 0 },
		{ status: "out_of_service", count: 2 },
		{ status: "decommissioned", count: 0 },
	]);
});
