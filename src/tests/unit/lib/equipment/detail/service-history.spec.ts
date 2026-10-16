import { describe, expect, test } from "vite-plus/test";

import {
	buildTimeline,
	daysBetween,
	type HistoryOrder,
	orderDate,
	serviceStats,
	unitShare,
} from "#lib/equipment/detail/service-history.ts";
import { at, day } from "#unit/temporal-support.ts";

let nextId = 1;

/** An order on the unit; completed on `completedAt` unless the status says otherwise. */
function order(fields: Partial<HistoryOrder> = {}): HistoryOrder {
	const id = nextId++;
	return {
		id,
		number: `ORD-2026-${String(id).padStart(5, "0")}`,
		type: "maintenance",
		status: fields.completedAt ? "completed" : "scheduled",
		description: "Annual service",
		scheduledFor: null,
		completedAt: null,
		createdAt: at("2026-01-01 00:00"),
		laborHours: 2,
		engineer: null,
		units: 1,
		cost: { costs: [], labor: 0, adjustments: [], total: 10_000 },
		...fields,
	};
}

const now = at("2026-10-07 14:30");
const unit = { installedAt: day("2024-03-01"), warrantyUntil: day("2027-03-01") };

describe("orderDate", () => {
	test("is the completion, else the schedule, else the creation", () => {
		const createdAt = at("2026-01-01 00:00");
		const scheduledFor = at("2026-01-10 00:00");
		const completedAt = at("2026-01-11 00:00");
		expect(orderDate({ createdAt, scheduledFor, completedAt })).toBe(completedAt);
		expect(orderDate({ createdAt, scheduledFor, completedAt: null })).toBe(scheduledFor);
		expect(orderDate({ createdAt, scheduledFor: null, completedAt: null })).toBe(createdAt);
	});
});

describe("buildTimeline", () => {
	test("puts the installation, the orders and the warranty's end newest first", () => {
		const repair = order({ type: "repair", completedAt: at("2025-06-03 00:00") });
		const quote = order({ status: "quote", createdAt: at("2026-09-30 00:00") });
		const visit = order({ scheduledFor: at("2026-10-20 00:00") });

		const events = buildTimeline(unit, [quote, repair, visit], now);
		expect(
			events.map((event) => (event.kind === "order" ? event.order.number : event.kind)),
		).toEqual(["warranty", visit.number, quote.number, repair.number, "installation"]);
		expect(events.map((event) => event.date)).toEqual([
			unit.warrantyUntil,
			day("2026-10-20"),
			day("2026-09-30"),
			day("2025-06-03"),
			unit.installedAt,
		]);
	});

	test("marks a warranty that still covers work as upcoming, including on its last day", () => {
		const until = day("2026-10-07");
		const upcoming = (when: Temporal.Instant | Temporal.PlainDate) =>
			buildTimeline({ ...unit, warrantyUntil: until }, [], when).find(
				(event) => event.kind === "warranty",
			);
		expect(upcoming(now)).toEqual({ kind: "warranty", date: until, upcoming: true });
		expect(upcoming(day("2026-10-08"))).toMatchObject({ upcoming: false });
	});

	test("on the same day, shows the warranty's end above orders and the installation below", () => {
		const moment = at("2025-01-01 00:00");
		const first = order({ completedAt: moment });
		const second = order({ completedAt: moment });
		const events = buildTimeline(
			{ installedAt: day("2025-01-01"), warrantyUntil: day("2025-01-01") },
			[first, second],
			now,
		);
		expect(events.map((event) => (event.kind === "order" ? event.order.id : event.kind))).toEqual([
			"warranty",
			second.id,
			first.id,
			"installation",
		]);
	});

	test("a unit without orders has just its installation and warranty", () => {
		expect(buildTimeline(unit, [], now).map((event) => event.kind)).toEqual([
			"warranty",
			"installation",
		]);
	});
});

describe("daysBetween", () => {
	test("counts calendar days, whatever the time of day", () => {
		expect(daysBetween(at("2026-01-01 23:59"), at("2026-01-02 00:01"))).toBe(1);
		expect(daysBetween(at("2026-01-01 00:01"), at("2026-01-01 23:59"))).toBe(0);
		expect(daysBetween(at("2026-01-01 00:00"), at("2026-12-31 00:00"))).toBe(364);
	});

	test("isn't thrown off by daylight saving time", () => {
		expect(daysBetween(at("2026-03-01 00:00"), at("2026-04-01 00:00"))).toBe(31);
		expect(daysBetween(at("2026-10-01 00:00"), at("2026-11-01 00:00"))).toBe(31);
	});
});

describe("serviceStats", () => {
	test("a new unit has nothing to show", () => {
		expect(serviceStats([], now)).toEqual({
			orders: 0,
			ordersByType: [],
			openOrders: 0,
			doneOrders: 0,
			cost: 0,
			lastService: null,
			repairs: 0,
			daysSinceLastRepair: null,
			daysBetweenRepairs: null,
		});
	});

	test("counts orders by type and status, and the cost of the done ones only", () => {
		const stats = serviceStats(
			[
				order({ type: "installation", status: "invoiced", completedAt: at("2024-03-01 00:00") }),
				order({ type: "maintenance", completedAt: at("2025-03-01 00:00") }),
				order({ type: "maintenance", status: "in_progress" }),
				order({ type: "inspection", status: "quote" }),
				order({ type: "repair", status: "cancelled" }),
			],
			now,
		);
		expect(stats).toMatchObject({
			orders: 5,
			// The types it has orders of, in the order they're picked in.
			ordersByType: [
				{ type: "repair", count: 1 },
				{ type: "maintenance", count: 2 },
				{ type: "inspection", count: 1 },
				{ type: "installation", count: 1 },
			],
			openOrders: 2,
			doneOrders: 2,
			cost: 20_000,
			lastService: at("2025-03-01 00:00"),
		});
	});

	test("an order about several units counts for each, at its share of the cost", () => {
		const together = order({ units: 4, completedAt: at("2025-03-01 00:00") });
		expect(unitShare(together)).toBe(2_500);
		expect(unitShare(order({ units: 3 }))).toBe(3_333);
		const stats = serviceStats(
			[together, order({ type: "repair", completedAt: at("2025-06-01 00:00") })],
			now,
		);
		expect(stats).toMatchObject({ orders: 2, doneOrders: 2, cost: 12_500 });
	});

	test("the last service is the latest completion, whatever the order of the orders", () => {
		const stats = serviceStats(
			[
				order({ completedAt: at("2025-05-01 00:00") }),
				order({ completedAt: at("2026-05-01 00:00") }),
				order({ completedAt: at("2025-10-01 00:00") }),
			],
			now,
		);
		expect(stats.lastService).toEqual(at("2026-05-01 00:00"));
	});

	test("one repair gives the days since, but no mean time between repairs", () => {
		const stats = serviceStats(
			[order({ type: "repair", completedAt: at("2026-10-01 16:00") })],
			now,
		);
		expect(stats).toMatchObject({ repairs: 1, daysSinceLastRepair: 6, daysBetweenRepairs: null });
	});

	test("the mean time between repairs spans the first to the last done repair", () => {
		const stats = serviceStats(
			[
				order({ type: "repair", completedAt: at("2026-07-01 00:00") }),
				order({ type: "repair", completedAt: at("2026-01-01 00:00") }),
				order({ type: "repair", completedAt: at("2026-04-01 00:00") }),
				// Not done yet, and not a repair: neither counts.
				order({ type: "repair", status: "in_progress", scheduledFor: at("2026-10-06 00:00") }),
				order({ type: "maintenance", completedAt: at("2026-09-01 00:00") }),
			],
			now,
		);
		// 1 January to 1 July is 181 days, over two intervals.
		expect(stats).toMatchObject({ repairs: 3, daysSinceLastRepair: 98, daysBetweenRepairs: 91 });
	});

	test("breakdowns count as repairs, damage doesn't", () => {
		const stats = serviceStats(
			[
				order({ type: "breakdown", completedAt: at("2026-01-01 00:00") }),
				order({ type: "repair", completedAt: at("2026-07-01 00:00") }),
				order({ type: "damage", completedAt: at("2026-09-01 00:00") }),
			],
			now,
		);
		expect(stats).toMatchObject({ repairs: 2, daysSinceLastRepair: 98, daysBetweenRepairs: 181 });
	});

	test("a repair completed today was zero days ago", () => {
		const stats = serviceStats(
			[order({ type: "repair", completedAt: at("2026-10-07 09:00") })],
			now,
		);
		expect(stats.daysSinceLastRepair).toBe(0);
	});
});
