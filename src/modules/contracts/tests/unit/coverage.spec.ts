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

const day = (value: string) => new Date(`${value}T00:00`);
const HOUR = 60 * 60 * 1000;

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
		expect(coveringContract([year], new Date(2026, 11, 31, 23, 59))).toBe(year);
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

	test("covers servicing a unit, not installing one", () => {
		expect(isCoveredWork("repair")).toBe(true);
		expect(isCoveredWork("maintenance")).toBe(true);
		expect(isCoveredWork("inspection")).toBe(true);
		expect(isCoveredWork("installation")).toBe(false);
	});

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
	const createdAt = new Date(2026, 9, 7, 8, 0);
	const order = (fields: { type?: OrderType; status?: OrderStatus } = {}) => ({
		type: "repair" as OrderType,
		status: "quote" as OrderStatus,
		createdAt,
		...fields,
	});
	const at = (hours: number) => new Date(createdAt.getTime() + hours * HOUR);

	test("a covered repair is due the contract's response time after it was created", () => {
		expect(responseDeadline(order(), 4, at(1))).toEqual({
			due: new Date(2026, 9, 7, 12, 0),
			state: "on_track",
		});
		expect(responseDeadline(order(), 72, at(1))?.due).toEqual(new Date(2026, 9, 10, 8, 0));
	});

	test.each<OrderType>(["maintenance", "inspection", "installation"])(
		"%s work has no deadline",
		(type) => {
			expect(responseDeadline(order({ type }), 4, at(10))).toBeNull();
		},
	);

	test("a cancelled call-out has no deadline", () => {
		expect(responseDeadline(order({ status: "cancelled" }), 4, at(10))).toBeNull();
	});

	test.each<OrderStatus>(["scheduled", "in_progress", "completed", "invoiced"])(
		"a %s call-out has been responded to, even after the deadline",
		(status) => {
			expect(responseDeadline(order({ status }), 4, at(1))?.state).toBe("responded");
			expect(responseDeadline(order({ status }), 4, at(10))?.state).toBe("responded");
		},
	);

	test("a call-out waiting for a response is on track until a quarter of the time is left", () => {
		// 24 hours to respond: at risk for the last 6.
		expect(responseDeadline(order(), 24, at(0))?.state).toBe("on_track");
		expect(responseDeadline(order(), 24, at(18))?.state).toBe("on_track");
		expect(responseDeadline(order(), 24, new Date(at(18).getTime() + 1))?.state).toBe("at_risk");
		expect(responseDeadline(order(), 24, at(23.99))?.state).toBe("at_risk");
	});

	test("it's overdue from the deadline on", () => {
		expect(responseDeadline(order(), 24, at(24))?.state).toBe("overdue");
		expect(responseDeadline(order(), 24, at(100))?.state).toBe("overdue");
	});

	test("without any time to respond, it's overdue at once", () => {
		expect(slaState("quote", createdAt, 0, createdAt)).toBe("overdue");
	});
});
