import { describe, expect, test } from "vite-plus/test";

import type { OrderStatus } from "#lib/models.ts";
import {
	applyMove,
	boardEngineers,
	byPriorityThenAge,
	cellKey,
	dayKey,
	formatDay,
	formatLongDay,
	formatWeek,
	groupByCell,
	load,
	parseDay,
	startOfWeek,
	weekDays,
	weekFromParam,
	weekNumber,
} from "#modules/schedule/board/board.ts";

describe("days and weeks", () => {
	test("parseDay reads yyyy-mm-dd as the local start of that day", () => {
		expect(parseDay("2026-10-07")).toEqual(new Date(2026, 9, 7));
		expect(parseDay("2026-02-31")).toBeUndefined();
		expect(parseDay("7 October")).toBeUndefined();
		expect(parseDay("")).toBeUndefined();
		expect(parseDay(null)).toBeUndefined();
	});

	test("dayKey is the reverse", () => {
		expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
	});

	test("weeks start on Monday", () => {
		const monday = new Date(2026, 9, 5);
		expect(startOfWeek(new Date(2026, 9, 5, 8))).toEqual(monday);
		expect(startOfWeek(new Date(2026, 9, 7, 15, 30))).toEqual(monday);
		// Sunday is the last day of the week, not the first.
		expect(startOfWeek(new Date(2026, 9, 11, 23, 59))).toEqual(monday);
		expect(startOfWeek(new Date(2026, 9, 12))).toEqual(new Date(2026, 9, 12));
		// Across a month and a year.
		expect(startOfWeek(new Date(2027, 0, 1))).toEqual(new Date(2026, 11, 28));
	});

	test("the ?week= param may be any day of the week, and defaults to this week", () => {
		const today = new Date(2026, 9, 7, 10);
		expect(weekFromParam("2026-10-09", today)).toEqual(new Date(2026, 9, 5));
		expect(weekFromParam(null, today)).toEqual(new Date(2026, 9, 5));
		expect(weekFromParam("next week", today)).toEqual(new Date(2026, 9, 5));
	});

	test("a week has seven days, Monday to Sunday", () => {
		const days = weekDays(new Date(2026, 9, 26));
		expect(days.map(dayKey)).toEqual([
			"2026-10-26",
			"2026-10-27",
			"2026-10-28",
			"2026-10-29",
			"2026-10-30",
			"2026-10-31",
			"2026-11-01",
		]);
		expect(days.every((day) => day.getHours() === 0)).toBe(true);
	});

	test("week numbers follow ISO 8601", () => {
		expect(weekNumber(new Date(2026, 9, 7))).toBe(41);
		expect(weekNumber(new Date(2026, 0, 1))).toBe(1);
		// 1 January 2027 is a Friday, so it's in the last week of 2026.
		expect(weekNumber(new Date(2027, 0, 1))).toBe(53);
		expect(weekNumber(new Date(2027, 0, 4))).toBe(1);
		expect(weekNumber(new Date(2024, 11, 30))).toBe(1);
	});

	test("formatting", () => {
		expect(formatDay(new Date(2026, 9, 5))).toBe("Mon 5 Oct");
		expect(formatLongDay(new Date(2026, 9, 11))).toBe("Sunday 11 October");
		expect(formatWeek(new Date(2026, 9, 5))).toMatch(/^5\s?–\s?11 Oct 2026$/);
	});
});

describe("the board", () => {
	const on = (day: number, hours: number) => new Date(2026, 9, day, hours);
	const orders = [
		{ id: 1, engineerId: 7, scheduledFor: on(6, 14) },
		{ id: 2, engineerId: 7, scheduledFor: on(6, 8) },
		{ id: 3, engineerId: null, scheduledFor: on(6, 9) },
		{ id: 4, engineerId: 9, scheduledFor: on(7, 9) },
		{ id: 5, engineerId: 7, scheduledFor: null },
	];

	test("groups orders by engineer and day, by time", () => {
		const cells = groupByCell(orders, [7, 9]);
		expect([...cells.keys()].sort()).toEqual([
			"7/2026-10-06",
			"9/2026-10-07",
			"unassigned/2026-10-06",
		]);
		expect(cells.get(cellKey(7, on(6, 0)))!.map((o) => o.id)).toEqual([2, 1]);
		expect(cells.get(cellKey("unassigned", on(6, 0)))!.map((o) => o.id)).toEqual([3]);
	});

	test("orders of an engineer without a row count as unassigned", () => {
		const cells = groupByCell(orders, [7]);
		expect(cells.get("unassigned/2026-10-07")!.map((o) => o.id)).toEqual([4]);
	});

	test("rows are the active engineers, and inactive ones with orders in the week", () => {
		const engineers = [
			{ id: 7, active: true },
			{ id: 8, active: false },
			{ id: 9, active: false },
			{ id: 10, active: true },
		];
		expect(boardEngineers(engineers, orders).map((e) => e.id)).toEqual([7, 9, 10]);
	});

	test("the load of a cell", () => {
		expect([0, 1, 2, 3, 4, 6].map((count) => load(count))).toEqual([
			"none",
			"normal",
			"normal",
			"full",
			"over",
			"over",
		]);
		expect(load(2, 2)).toBe("full");
	});

	test("the backlog is most urgent first, then the longest waiting", () => {
		const backlog = [
			{ id: 1, priority: "normal" as const, createdAt: new Date(2026, 9, 1) },
			{ id: 2, priority: "urgent" as const, createdAt: new Date(2026, 9, 6) },
			{ id: 3, priority: "normal" as const, createdAt: new Date(2026, 8, 20) },
			{ id: 4, priority: "low" as const, createdAt: new Date(2026, 7, 1) },
			{ id: 5, priority: "high" as const, createdAt: new Date(2026, 9, 2) },
		];
		expect(backlog.sort(byPriorityThenAge).map((o) => o.id)).toEqual([2, 5, 3, 1, 4]);
	});
});

describe("planning an order", () => {
	const start = new Date(2026, 9, 5);
	const order = (id: number, status: OrderStatus, scheduledFor: Date | null) => ({
		id,
		status,
		scheduledFor,
		engineerId: scheduledFor ? 7 : null,
	});
	const schedule = {
		start,
		orders: [
			order(1, "scheduled", new Date(2026, 9, 6, 10)),
			order(2, "scheduled", new Date(2026, 9, 7, 8)),
		],
		backlog: [order(3, "quote", null), order(4, "quote", null)],
	};

	test("moving an order within the week", () => {
		const moved = applyMove(schedule, {
			id: 1,
			engineerId: null,
			scheduledFor: new Date(2026, 9, 9, 10),
		});
		expect(moved.orders).toEqual([
			schedule.orders[1],
			{ ...schedule.orders[0], engineerId: null, scheduledFor: new Date(2026, 9, 9, 10) },
		]);
		expect(moved.backlog).toEqual(schedule.backlog);
	});

	test("planning an order from the backlog", () => {
		const moved = applyMove(schedule, {
			id: 3,
			engineerId: 9,
			scheduledFor: new Date(2026, 9, 8, 9),
		});
		expect(moved.backlog.map((o) => o.id)).toEqual([4]);
		expect(moved.orders.at(-1)).toEqual({
			id: 3,
			status: "scheduled",
			engineerId: 9,
			scheduledFor: new Date(2026, 9, 8, 9),
		});
	});

	test("an order moved out of the week leaves the board", () => {
		const moved = applyMove(schedule, {
			id: 2,
			engineerId: 7,
			scheduledFor: new Date(2026, 9, 12, 8),
		});
		expect(moved.orders.map((o) => o.id)).toEqual([1]);
	});

	test("an unknown order changes nothing", () => {
		expect(applyMove(schedule, { id: 99, engineerId: 7, scheduledFor: start })).toBe(schedule);
	});
});
