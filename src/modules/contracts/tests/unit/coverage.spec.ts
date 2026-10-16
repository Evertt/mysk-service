import { describe, expect, test } from "vite-plus/test";

import type { OrderStatus, OrderType } from "#lib/models.ts";
import {
	coveredAmount,
	coveredBy,
	coveringContract,
	isCoveredWork,
	responseDeadline,
	slaState,
} from "#modules/contracts/coverage.ts";
import type { ContractLevel } from "#modules/contracts/model.ts";
import { at, day } from "#unit/temporal-support.ts";

describe("coverage", () => {
	const contract = (number: string, startsOn: string, endsOn: string, responseHours = 24) => ({
		number,
		startsOn: day(startsOn),
		endsOn: day(endsOn),
		responseHours,
	});

	test("counts a contract active on the day the order was created, up to its last day", () => {
		const year = contract("CTR-1", "2026-01-01", "2026-12-31");
		expect(coveringContract([year], day("2026-01-01"))).toBe(year);
		expect(coveringContract([year], at("2026-12-31 23:59"))).toBe(year);
		expect(coveringContract([year], day("2025-12-31"))).toBeUndefined();
		expect(coveringContract([year], day("2027-01-01"))).toBeUndefined();
	});

	test("takes the contract of the time, not today's", () => {
		const old = contract("CTR-1", "2025-01-01", "2025-12-31");
		const renewal = contract("CTR-2", "2026-01-01", "2026-12-31");
		expect(coveringContract([renewal, old], day("2025-06-01"))).toBe(old);
		expect(coveringContract([renewal, old], day("2026-06-01"))).toBe(renewal);
	});

	test("of overlapping contracts, the fastest response wins", () => {
		const slow = contract("CTR-1", "2026-01-01", "2026-12-31", 72);
		const fast = contract("CTR-2", "2026-03-01", "2026-12-31", 4);
		const alsoFast = contract("CTR-3", "2026-01-01", "2026-12-31", 4);
		expect(coveringContract([slow, fast], day("2026-06-01"))).toBe(fast);
		expect(coveringContract([slow, fast], day("2026-02-01"))).toBe(slow);
		expect(coveringContract([fast, alsoFast], day("2026-06-01"))).toBe(fast);
	});

	test.each<OrderType>(["breakdown", "repair", "maintenance", "inspection"])(
		"covers servicing a unit: %s",
		(type) => {
			expect(isCoveredWork(type)).toBe(true);
		},
	);

	test.each<OrderType>(["installation", "survey", "project", "damage", "other"])(
		"doesn't cover new work, damage or other work: %s",
		(type) => {
			expect(isCoveredWork(type)).toBe(false);
		},
	);

	test("names the contract and its level", () => {
		expect(coveredBy({ number: "CTR-2026-0004", level: "premium" })).toBe(
			"Covered by CTR-2026-0004 (Premium)",
		);
	});
});

describe("what a contract includes", () => {
	const price = { costs: 12_345, labor: 17_000 };

	test.each<[ContractLevel, number]>([
		["basic", 0],
		["standard", 17_000],
		["premium", 29_345],
	])("%s includes %i cents of the order", (level, amount) => {
		expect(coveredAmount(level, price)).toBe(amount);
	});

	test("includes nothing of an order that costs nothing", () => {
		expect(coveredAmount("premium", { costs: 0, labor: 0 })).toBe(0);
	});
});

describe("response time", () => {
	const createdAt = at("2026-10-07 08:00");
	const order = (fields: { type?: OrderType; status?: OrderStatus } = {}) => ({
		type: "repair" as OrderType,
		status: "quote" as OrderStatus,
		createdAt,
		...fields,
	});
	/** `hours` after the order was created. */
	const later = (hours: number) => createdAt.add({ milliseconds: Math.round(hours * 3_600_000) });

	test("a covered repair is due the contract's response time after it was created", () => {
		expect(responseDeadline(order(), 4, later(1))).toEqual({
			due: at("2026-10-07 12:00"),
			state: "on_track",
		});
		expect(responseDeadline(order(), 72, later(1))?.due).toEqual(at("2026-10-10 08:00"));
	});

	test("so is a covered breakdown", () => {
		expect(responseDeadline(order({ type: "breakdown" }), 4, later(1))).toEqual({
			due: at("2026-10-07 12:00"),
			state: "on_track",
		});
	});

	test.each<OrderType>([
		"maintenance",
		"inspection",
		"installation",
		"survey",
		"damage",
		"project",
		"other",
	])("%s work has no deadline", (type) => {
		expect(responseDeadline(order({ type }), 4, later(10))).toBeNull();
	});

	test("a cancelled call-out has no deadline", () => {
		expect(responseDeadline(order({ status: "cancelled" }), 4, later(10))).toBeNull();
	});

	test.each<OrderStatus>(["scheduled", "in_progress", "completed", "invoiced"])(
		"a %s call-out has been responded to, even after the deadline",
		(status) => {
			expect(responseDeadline(order({ status }), 4, later(1))?.state).toBe("responded");
			expect(responseDeadline(order({ status }), 4, later(10))?.state).toBe("responded");
		},
	);

	test("a call-out waiting for a response is on track until a quarter of the time is left", () => {
		// 24 hours to respond: at risk for the last 6.
		expect(responseDeadline(order(), 24, later(0))?.state).toBe("on_track");
		expect(responseDeadline(order(), 24, later(18))?.state).toBe("on_track");
		expect(responseDeadline(order(), 24, later(18).add({ milliseconds: 1 }))?.state).toBe(
			"at_risk",
		);
		expect(responseDeadline(order(), 24, later(23.99))?.state).toBe("at_risk");
	});

	test("it's overdue from the deadline on", () => {
		expect(responseDeadline(order(), 24, later(24))?.state).toBe("overdue");
		expect(responseDeadline(order(), 24, later(100))?.state).toBe("overdue");
	});

	test("without any time to respond, it's overdue at once", () => {
		expect(slaState("quote", createdAt, Temporal.Duration.from({ hours: 0 }), createdAt)).toBe(
			"overdue",
		);
	});
});
