import { describe, expect, test } from "vite-plus/test";

import type { OrderStatus } from "#lib/models.ts";
import {
	applyMove,
	boardEngineers,
	byPriorityThenAge,
	cellKey,
	formatDay,
	formatLongDay,
	formatWeek,
	groupByCell,
	load,
	parseDay,
	weekDays,
} from "#modules/schedule/board/board.ts";
import { at, day } from "#unit/temporal-support.ts";

describe("days and weeks", () => {
	test("parseDay reads yyyy-mm-dd as that day", () => {
		expect(parseDay("2026-10-07")).toEqual(day("2026-10-07"));
		expect(parseDay("2026-02-31")).toBeUndefined();
		expect(parseDay("7 October")).toBeUndefined();
		expect(parseDay("")).toBeUndefined();
		expect(parseDay(null)).toBeUndefined();
	});

	test("a week has seven days, Monday to Sunday", () => {
		const days = weekDays(day("2026-10-26"));
		expect(days.map(String)).toEqual([
			"2026-10-26",
			"2026-10-27",
			"2026-10-28",
			"2026-10-29",
			"2026-10-30",
			"2026-10-31",
			"2026-11-01",
		]);
	});

	test("formatting", () => {
		expect(formatDay(day("2026-10-05"))).toBe("Mon 5 Oct");
		expect(formatLongDay(day("2026-10-11"))).toBe("Sunday 11 October");
		expect(formatWeek(day("2026-10-05"))).toMatch(/^5\s?–\s?11 Oct 2026$/);
	});
});

describe("the board", () => {
	/** An hour of a day of October 2026. */
	const on = (date: number, hours: number) =>
		at(`2026-10-${String(date).padStart(2, "0")} ${String(hours).padStart(2, "0")}:00`);
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
		expect(cells.get(cellKey(7, day("2026-10-06")))!.map((o) => o.id)).toEqual([2, 1]);
		expect(cells.get(cellKey("unassigned", day("2026-10-06")))!.map((o) => o.id)).toEqual([3]);
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
			{ id: 1, priority: "normal" as const, createdAt: at("2026-10-01 00:00") },
			{ id: 2, priority: "urgent" as const, createdAt: at("2026-10-06 00:00") },
			{ id: 3, priority: "normal" as const, createdAt: at("2026-09-20 00:00") },
			{ id: 4, priority: "low" as const, createdAt: at("2026-08-01 00:00") },
			{ id: 5, priority: "high" as const, createdAt: at("2026-10-02 00:00") },
		];
		expect(backlog.sort(byPriorityThenAge).map((o) => o.id)).toEqual([2, 5, 3, 1, 4]);
	});
});

describe("planning an order", () => {
	const start = day("2026-10-05");
	const order = (id: number, status: OrderStatus, scheduledFor: Temporal.Instant | null) => ({
		id,
		status,
		scheduledFor,
		engineerId: scheduledFor ? 7 : null,
	});
	const schedule = {
		start,
		orders: [
			order(1, "scheduled", at("2026-10-06 10:00")),
			order(2, "scheduled", at("2026-10-07 08:00")),
		],
		backlog: [order(3, "quote", null), order(4, "quote", null)],
	};

	test("moving an order within the week", () => {
		const moved = applyMove(schedule, {
			id: 1,
			engineerId: null,
			scheduledFor: at("2026-10-09 10:00"),
		});
		expect(moved.orders).toEqual([
			schedule.orders[1],
			{ ...schedule.orders[0], engineerId: null, scheduledFor: at("2026-10-09 10:00") },
		]);
		expect(moved.backlog).toEqual(schedule.backlog);
	});

	test("planning an order from the backlog", () => {
		const moved = applyMove(schedule, {
			id: 3,
			engineerId: 9,
			scheduledFor: at("2026-10-08 09:00"),
		});
		expect(moved.backlog.map((o) => o.id)).toEqual([4]);
		expect(moved.orders.at(-1)).toEqual({
			id: 3,
			status: "scheduled",
			engineerId: 9,
			scheduledFor: at("2026-10-08 09:00"),
		});
	});

	test("an order moved out of the week leaves the board", () => {
		const moved = applyMove(schedule, {
			id: 2,
			engineerId: 7,
			scheduledFor: at("2026-10-12 08:00"),
		});
		expect(moved.orders.map((o) => o.id)).toEqual([1]);
	});

	test("an unknown order changes nothing", () => {
		expect(
			applyMove(schedule, { id: 99, engineerId: 7, scheduledFor: at("2026-10-05 09:00") }),
		).toBe(schedule);
	});
});
