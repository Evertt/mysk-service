import { describe, expect, test } from "vite-plus/test";

import {
	equipmentByStatus,
	lastMonths,
	lastWeeks,
	ordersPerWeek,
	revenuePerMonth,
} from "./dashboard-charts.ts";

// A Wednesday.
const now = new Date(2026, 9, 7, 14, 30);

describe("lastWeeks", () => {
	test("are the Mondays up to this week's, oldest first", () => {
		expect(lastWeeks(now, 3)).toEqual([
			new Date(2026, 8, 21),
			new Date(2026, 8, 28),
			new Date(2026, 9, 5),
		]);
	});

	test("cover twelve weeks by default", () => {
		const weeks = lastWeeks(now);
		expect(weeks).toHaveLength(12);
		expect(weeks[0]).toEqual(new Date(2026, 6, 20));
		expect(weeks.at(-1)).toEqual(new Date(2026, 9, 5));
	});
});

describe("lastMonths", () => {
	test("are the first days up to this month's, oldest first, across a year", () => {
		expect(lastMonths(now, 3)).toEqual([
			new Date(2026, 7, 1),
			new Date(2026, 8, 1),
			new Date(2026, 9, 1),
		]);
		expect(lastMonths(new Date(2026, 0, 15), 2)).toEqual([
			new Date(2025, 11, 1),
			new Date(2026, 0, 1),
		]);
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
				week: new Date(2026, 8, 28),
				quote: 0,
				scheduled: 0,
				in_progress: 0,
				completed: 0,
				invoiced: 1,
				cancelled: 0,
			},
			{
				week: new Date(2026, 9, 5),
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
				{ completedAt: new Date(2026, 9, 2, 9), total: 10_000 },
				{ completedAt: new Date(2026, 9, 6, 17), total: 2_550 },
				{ completedAt: new Date(2026, 7, 31, 23, 59), total: 700 },
			],
			months,
		);

		expect(result).toEqual([
			{ month: new Date(2026, 7, 1), total: 700, orders: 1 },
			{ month: new Date(2026, 8, 1), total: 0, orders: 0 },
			{ month: new Date(2026, 9, 1), total: 12_550, orders: 2 },
		]);
	});

	test("leaves out orders completed before the period", () => {
		const result = revenuePerMonth([{ completedAt: new Date(2026, 6, 31), total: 500 }], months);

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
