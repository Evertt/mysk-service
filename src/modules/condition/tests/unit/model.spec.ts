import { describe, expect, test } from "vite-plus/test";

import { formatCode } from "#lib/numbering.ts";
import {
	addWorkingDays,
	componentNumber,
	componentStatus,
	concernOf,
	defaultThresholds,
	rolledUpStatus,
	isWorkingDay,
	scoreBand,
	type UnitFacts,
	unitStatus,
	validThresholds,
} from "#modules/condition/model.ts";
import { day } from "#unit/temporal-support.ts";

/** A unit with nothing to say: no condition, no inspection module, no planned work. */
const facts = (overrides: Partial<UnitFacts> = {}): UnitFacts => ({
	score: null,
	advice: null,
	inspection: null,
	planned: false,
	...overrides,
});
const thresholds = defaultThresholds;

describe("a unit's status", () => {
	test("is ok without anything recorded, with or without checklists and maintenance", () => {
		expect(unitStatus(facts(), thresholds)).toEqual({ status: "ok", concern: "ok" });
		expect(unitStatus(facts({ inspection: "none" }), thresholds).status).toBe("ok");
		expect(unitStatus(facts({ inspection: "valid" }), thresholds).status).toBe("ok");
		// Expiring isn't a concern yet.
		expect(unitStatus(facts({ inspection: "expiring" }), thresholds).status).toBe("ok");
	});

	test("is critical below the critical threshold, attention below the attention one", () => {
		expect(concernOf(facts({ score: 0 }), thresholds)).toBe("critical");
		expect(concernOf(facts({ score: 39 }), thresholds)).toBe("critical");
		expect(concernOf(facts({ score: 40 }), thresholds)).toBe("attention");
		expect(concernOf(facts({ score: 69 }), thresholds)).toBe("attention");
		expect(concernOf(facts({ score: 70 }), thresholds)).toBe("ok");
		expect(concernOf(facts({ score: 100 }), thresholds)).toBe("ok");
	});

	test("follows the tenant's thresholds", () => {
		const strict = { critical: 50, attention: 80 };
		expect(concernOf(facts({ score: 45 }), strict)).toBe("critical");
		expect(concernOf(facts({ score: 75 }), strict)).toBe("attention");
		expect(concernOf(facts({ score: 80 }), strict)).toBe("ok");
	});

	test("is critical when the inspection has expired, whatever the score", () => {
		expect(concernOf(facts({ score: 95, inspection: "expired" }), thresholds)).toBe("critical");
		expect(concernOf(facts({ inspection: "expired" }), thresholds)).toBe("critical");
	});

	test("needs attention after a rejected inspection, or with open advice", () => {
		expect(concernOf(facts({ score: 95, inspection: "rejected" }), thresholds)).toBe("attention");
		expect(concernOf(facts({ score: 95, advice: "Rollen vervangen." }), thresholds)).toBe(
			"attention",
		);
		// Blank advice is none.
		expect(concernOf(facts({ score: 95, advice: "  " }), thresholds)).toBe("ok");
		// A low score is worse than a rejection.
		expect(concernOf(facts({ score: 20, inspection: "rejected" }), thresholds)).toBe("critical");
	});

	test("is planned while an open order on it is scheduled, keeping what it's for", () => {
		expect(unitStatus(facts({ score: 22, planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "critical",
		});
		expect(unitStatus(facts({ inspection: "rejected", planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "attention",
		});
		expect(unitStatus(facts({ score: 90, planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "ok",
		});
	});
});

describe("a score's band", () => {
	test("is low, fair or good by the thresholds", () => {
		expect(scoreBand(22, thresholds)).toBe("low");
		expect(scoreBand(40, thresholds)).toBe("fair");
		expect(scoreBand(69, thresholds)).toBe("fair");
		expect(scoreBand(70, thresholds)).toBe("good");
	});
});

test("thresholds are whole percentages, critical below attention", () => {
	expect(validThresholds({ critical: 40, attention: 70 })).toBe(true);
	expect(validThresholds({ critical: 1, attention: 100 })).toBe(true);
	expect(validThresholds({ critical: 70, attention: 70 })).toBe(false);
	expect(validThresholds({ critical: 80, attention: 70 })).toBe(false);
	expect(validThresholds({ critical: 0, attention: 70 })).toBe(false);
	expect(validThresholds({ critical: 40, attention: 101 })).toBe(false);
	expect(validThresholds({ critical: 40.5, attention: 70 })).toBe(false);
});

describe("a component's status and its unit's", () => {
	const part = (score: number | null, advice: string | null = null) => ({ score, advice });

	test("a component's follows the unit's rules from its own condition", () => {
		expect(componentStatus(part(22), facts({ score: 90 }), thresholds)).toEqual({
			status: "critical",
			concern: "critical",
		});
		expect(componentStatus(part(55), facts(), thresholds).status).toBe("attention");
		expect(componentStatus(part(90, "Kabelset meenemen."), facts(), thresholds).status).toBe(
			"attention",
		);
		// Not the unit's own score or advice.
		expect(
			componentStatus(part(90), facts({ score: 10, advice: "Kapot" }), thresholds).status,
		).toBe("ok");
		expect(componentStatus(part(null), facts(), thresholds).status).toBe("ok");
	});

	test("a component's takes its unit's inspection and planned work", () => {
		expect(componentStatus(part(95), facts({ inspection: "expired" }), thresholds).status).toBe(
			"critical",
		);
		expect(componentStatus(part(95), facts({ inspection: "rejected" }), thresholds).status).toBe(
			"attention",
		);
		expect(componentStatus(part(22), facts({ planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "critical",
		});
	});

	test("a unit's is the worst of its own and its components'", () => {
		expect(rolledUpStatus(facts({ score: 90 }), [], thresholds)).toEqual(
			unitStatus(facts({ score: 90 }), thresholds),
		);
		expect(rolledUpStatus(facts({ score: 90 }), [part(84), part(22)], thresholds)).toEqual({
			status: "critical",
			concern: "critical",
		});
		expect(rolledUpStatus(facts({ score: 30 }), [part(84), part(95)], thresholds).status).toBe(
			"critical",
		);
		expect(rolledUpStatus(facts({ score: 90 }), [part(60), part(95)], thresholds).status).toBe(
			"attention",
		);
		expect(rolledUpStatus(facts(), [part(null)], thresholds).status).toBe("ok");
		// Planned while its work is in hand, keeping what's worst behind it.
		expect(
			rolledUpStatus(facts({ score: 90, planned: true }), [part(60), part(22)], thresholds),
		).toEqual({ status: "planned", concern: "critical" });
	});

	test("components are numbered like the mockup's codes", () => {
		expect(formatCode(componentNumber, 1)).toBe("OC-0001");
		expect(formatCode(componentNumber, 1041)).toBe("OC-1041");
	});
});

describe("working days", () => {
	test("are Monday to Friday", () => {
		// 2026-10-12 is a Monday.
		expect(isWorkingDay(day("2026-10-12"))).toBe(true);
		expect(isWorkingDay(day("2026-10-16"))).toBe(true);
		expect(isWorkingDay(day("2026-10-17"))).toBe(false);
		expect(isWorkingDay(day("2026-10-18"))).toBe(false);
	});

	test("count from the day after, skipping weekends", () => {
		expect(addWorkingDays(day("2026-10-12"), 5)).toEqual(day("2026-10-19"));
		expect(addWorkingDays(day("2026-10-14"), 5)).toEqual(day("2026-10-21"));
		expect(addWorkingDays(day("2026-10-16"), 1)).toEqual(day("2026-10-19"));
		// From a weekend, the next five working days end on Friday.
		expect(addWorkingDays(day("2026-10-17"), 5)).toEqual(day("2026-10-23"));
		expect(addWorkingDays(day("2026-10-18"), 5)).toEqual(day("2026-10-23"));
		expect(addWorkingDays(day("2026-10-12"), 0)).toEqual(day("2026-10-12"));
		// Across a month's end.
		expect(addWorkingDays(day("2026-10-29"), 5)).toEqual(day("2026-11-05"));
	});
});
