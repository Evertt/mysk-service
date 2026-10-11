import { describe, expect, test } from "vite-plus/test";

import {
	buildTimeline,
	daysBetween,
	type HistoryOrder,
	orderDate,
	serviceStats,
} from "#lib/equipment/detail/service-history.ts";

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
		createdAt: new Date(2026, 0, 1),
		laborHours: 2,
		engineer: null,
		materials: [],
		cost: { materials: 0, labor: 0, adjustments: [], total: 10_000 },
		...fields,
	};
}

const now = new Date(2026, 9, 7, 14, 30);
const unit = { installedAt: new Date(2024, 2, 1), warrantyUntil: new Date(2027, 2, 1) };

describe("orderDate", () => {
	test("is the completion, else the schedule, else the creation", () => {
		const createdAt = new Date(2026, 0, 1);
		const scheduledFor = new Date(2026, 0, 10);
		const completedAt = new Date(2026, 0, 11);
		expect(orderDate({ createdAt, scheduledFor, completedAt })).toBe(completedAt);
		expect(orderDate({ createdAt, scheduledFor, completedAt: null })).toBe(scheduledFor);
		expect(orderDate({ createdAt, scheduledFor: null, completedAt: null })).toBe(createdAt);
	});
});

describe("buildTimeline", () => {
	test("puts the installation, the orders and the warranty's end newest first", () => {
		const repair = order({ type: "repair", completedAt: new Date(2025, 5, 3) });
		const quote = order({ status: "quote", createdAt: new Date(2026, 8, 30) });
		const visit = order({ scheduledFor: new Date(2026, 9, 20) });

		const events = buildTimeline(unit, [quote, repair, visit], now);
		expect(
			events.map((event) => (event.kind === "order" ? event.order.number : event.kind)),
		).toEqual(["warranty", visit.number, quote.number, repair.number, "installation"]);
		expect(events.map((event) => event.date)).toEqual([
			unit.warrantyUntil,
			visit.scheduledFor,
			quote.createdAt,
			repair.completedAt,
			unit.installedAt,
		]);
	});

	test("marks a warranty that still covers work as upcoming, including on its last day", () => {
		const until = new Date(2026, 9, 7);
		const upcoming = (at: Date) =>
			buildTimeline({ ...unit, warrantyUntil: until }, [], at).find(
				(event) => event.kind === "warranty",
			);
		expect(upcoming(now)).toEqual({ kind: "warranty", date: until, upcoming: true });
		expect(upcoming(new Date(2026, 9, 8))).toMatchObject({ upcoming: false });
	});

	test("on the same day, shows the warranty's end above orders and the installation below", () => {
		const day = new Date(2025, 0, 1);
		const first = order({ completedAt: day });
		const second = order({ completedAt: day });
		const events = buildTimeline({ installedAt: day, warrantyUntil: day }, [first, second], now);
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
		expect(daysBetween(new Date(2026, 0, 1, 23, 59), new Date(2026, 0, 2, 0, 1))).toBe(1);
		expect(daysBetween(new Date(2026, 0, 1, 0, 1), new Date(2026, 0, 1, 23, 59))).toBe(0);
		expect(daysBetween(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(364);
	});

	test("isn't thrown off by daylight saving time", () => {
		expect(daysBetween(new Date(2026, 2, 1), new Date(2026, 3, 1))).toBe(31);
		expect(daysBetween(new Date(2026, 9, 1), new Date(2026, 10, 1))).toBe(31);
	});
});

describe("serviceStats", () => {
	test("a new unit has nothing to show", () => {
		expect(serviceStats([], now)).toEqual({
			orders: 0,
			ordersByType: { installation: 0, maintenance: 0, repair: 0, inspection: 0 },
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
				order({ type: "installation", status: "invoiced", completedAt: new Date(2024, 2, 1) }),
				order({ type: "maintenance", completedAt: new Date(2025, 2, 1) }),
				order({ type: "maintenance", status: "in_progress" }),
				order({ type: "inspection", status: "quote" }),
				order({ type: "repair", status: "cancelled" }),
			],
			now,
		);
		expect(stats).toMatchObject({
			orders: 5,
			ordersByType: { installation: 1, maintenance: 2, repair: 1, inspection: 1 },
			openOrders: 2,
			doneOrders: 2,
			cost: 20_000,
			lastService: new Date(2025, 2, 1),
		});
	});

	test("the last service is the latest completion, whatever the order of the orders", () => {
		const stats = serviceStats(
			[
				order({ completedAt: new Date(2025, 4, 1) }),
				order({ completedAt: new Date(2026, 4, 1) }),
				order({ completedAt: new Date(2025, 9, 1) }),
			],
			now,
		);
		expect(stats.lastService).toEqual(new Date(2026, 4, 1));
	});

	test("one repair gives the days since, but no mean time between repairs", () => {
		const stats = serviceStats(
			[order({ type: "repair", completedAt: new Date(2026, 9, 1, 16, 0) })],
			now,
		);
		expect(stats).toMatchObject({ repairs: 1, daysSinceLastRepair: 6, daysBetweenRepairs: null });
	});

	test("the mean time between repairs spans the first to the last done repair", () => {
		const stats = serviceStats(
			[
				order({ type: "repair", completedAt: new Date(2026, 6, 1) }),
				order({ type: "repair", completedAt: new Date(2026, 0, 1) }),
				order({ type: "repair", completedAt: new Date(2026, 3, 1) }),
				// Not done yet, and not a repair: neither counts.
				order({ type: "repair", status: "in_progress", scheduledFor: new Date(2026, 9, 6) }),
				order({ type: "maintenance", completedAt: new Date(2026, 8, 1) }),
			],
			now,
		);
		// 1 January to 1 July is 181 days, over two intervals.
		expect(stats).toMatchObject({ repairs: 3, daysSinceLastRepair: 98, daysBetweenRepairs: 91 });
	});

	test("a repair completed today was zero days ago", () => {
		const stats = serviceStats(
			[order({ type: "repair", completedAt: new Date(2026, 9, 7, 9) })],
			now,
		);
		expect(stats.daysSinceLastRepair).toBe(0);
	});
});
