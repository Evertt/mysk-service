import { describe, expect, test } from "vite-plus/test";

import { formatCode } from "#lib/numbering.ts";
import {
	addWorkingDays,
	componentNumber,
	componentStatus,
	concernOf,
	currentScore,
	defaultThresholds,
	elementScore,
	elementScores,
	recordScore,
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

	test("is critical from the critical threshold, attention from the attention one", () => {
		expect(concernOf(facts({ score: 6 }), thresholds)).toBe("critical");
		expect(concernOf(facts({ score: 5 }), thresholds)).toBe("critical");
		expect(concernOf(facts({ score: 4 }), thresholds)).toBe("attention");
		expect(concernOf(facts({ score: 3 }), thresholds)).toBe("ok");
		expect(concernOf(facts({ score: 1 }), thresholds)).toBe("ok");
	});

	test("follows the tenant's thresholds", () => {
		const strict = { critical: 4, attention: 3 };
		expect(concernOf(facts({ score: 4 }), strict)).toBe("critical");
		expect(concernOf(facts({ score: 3 }), strict)).toBe("attention");
		expect(concernOf(facts({ score: 2 }), strict)).toBe("ok");
	});

	test("is critical when the inspection has expired, whatever the score", () => {
		expect(concernOf(facts({ score: 1, inspection: "expired" }), thresholds)).toBe("critical");
		expect(concernOf(facts({ inspection: "expired" }), thresholds)).toBe("critical");
	});

	test("needs attention after a rejected inspection, or with open advice", () => {
		expect(concernOf(facts({ score: 1, inspection: "rejected" }), thresholds)).toBe("attention");
		expect(concernOf(facts({ score: 1, advice: "Rollen vervangen." }), thresholds)).toBe(
			"attention",
		);
		// Blank advice is none.
		expect(concernOf(facts({ score: 1, advice: "  " }), thresholds)).toBe("ok");
		// A low score is worse than a rejection.
		expect(concernOf(facts({ score: 6, inspection: "rejected" }), thresholds)).toBe("critical");
	});

	test("is planned while an open order on it is scheduled, keeping what it's for", () => {
		expect(unitStatus(facts({ score: 5, planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "critical",
		});
		expect(unitStatus(facts({ inspection: "rejected", planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "attention",
		});
		expect(unitStatus(facts({ score: 1, planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "ok",
		});
	});
});

describe("a score's band", () => {
	test("is low, fair or good by the thresholds", () => {
		expect(scoreBand(6, thresholds)).toBe("low");
		expect(scoreBand(5, thresholds)).toBe("low");
		expect(scoreBand(4, thresholds)).toBe("fair");
		expect(scoreBand(3, thresholds)).toBe("good");
		expect(scoreBand(1, thresholds)).toBe("good");
	});
});

test("thresholds are scores from 2 to 6, attention below critical", () => {
	expect(validThresholds({ critical: 5, attention: 4 })).toBe(true);
	expect(validThresholds({ critical: 6, attention: 2 })).toBe(true);
	expect(validThresholds({ critical: 3, attention: 2 })).toBe(true);
	expect(validThresholds({ critical: 4, attention: 4 })).toBe(false);
	expect(validThresholds({ critical: 4, attention: 5 })).toBe(false);
	expect(validThresholds({ critical: 5, attention: 1 })).toBe(false);
	expect(validThresholds({ critical: 7, attention: 4 })).toBe(false);
	expect(validThresholds({ critical: 4.5, attention: 3 })).toBe(false);
});

describe("defects and scores (the norm's method per element, the worst element)", () => {
	// Severe, advanced, 30–70%: category 4, 30 points, so 4.
	const spring = { severity: "severe", extent: 50, intensity: "advanced" } as const;
	// Slight, initial, 2–10%: category 1, 0.2 points, so 1.
	const seal = { severity: "slight", extent: 5, intensity: "initial" } as const;
	// Serious, final, 10–30%: category 4 too, 10 points, so 3.
	const cable = { severity: "serious", extent: 25, intensity: "final" } as const;
	const on = (componentId: number | null, ...defects: { severity: string }[]) =>
		defects.map((defect) => ({ ...(defect as typeof spring), componentId }));

	test("a condition without defects scores 1, with them its worst element's", () => {
		expect(recordScore([])).toBe(1);
		expect(recordScore(on(null, seal))).toBe(1);
		expect(recordScore([...on(null, seal), ...on(1, spring)])).toBe(4);
		expect(recordScore([...on(null, cable), ...on(1, seal)])).toBe(3);
	});

	test("an element's defects of one category add their extents up, so it can score worse than each", () => {
		// The spring and the cable on one component: category 4 at 75%, 70 points, so 5.
		const defects = [...on(1, spring, cable), ...on(null, seal), ...on(2, cable)];
		expect(elementScore(defects, 1)).toBe(5);
		expect(elementScore(defects, 2)).toBe(3);
		expect(elementScore(defects, null)).toBe(1);
		expect(elementScore(defects, 3)).toBe(1);
		expect(elementScores(defects)).toEqual(
			new Map([
				[1, 5],
				[null, 1],
				[2, 3],
			]),
		);
		// Apart, on two elements, each scores alone, and the worst is 4.
		expect(recordScore([...on(1, spring), ...on(2, cable)])).toBe(4);
		expect(recordScore(defects)).toBe(5);
	});

	test("a unit's current score is the worst of its own and its components' latest", () => {
		expect(currentScore(null, [])).toBeNull();
		expect(currentScore(null, [null])).toBeNull();
		expect(currentScore(2, [])).toBe(2);
		expect(currentScore(2, [5, null, 3])).toBe(5);
		expect(currentScore(null, [3])).toBe(3);
		expect(currentScore(6, [1])).toBe(6);
	});
});

describe("a component's status and its unit's", () => {
	const part = (score: number | null, advice: string | null = null) => ({ score, advice });

	test("a component's follows the unit's rules from its own condition", () => {
		expect(componentStatus(part(5), facts({ score: 1 }), thresholds)).toEqual({
			status: "critical",
			concern: "critical",
		});
		expect(componentStatus(part(4), facts(), thresholds).status).toBe("attention");
		expect(componentStatus(part(1, "Kabelset meenemen."), facts(), thresholds).status).toBe(
			"attention",
		);
		// Not the unit's own score or advice.
		expect(componentStatus(part(1), facts({ score: 6, advice: "Kapot" }), thresholds).status).toBe(
			"ok",
		);
		expect(componentStatus(part(null), facts(), thresholds).status).toBe("ok");
	});

	test("a component's takes its unit's inspection and planned work", () => {
		expect(componentStatus(part(1), facts({ inspection: "expired" }), thresholds).status).toBe(
			"critical",
		);
		expect(componentStatus(part(1), facts({ inspection: "rejected" }), thresholds).status).toBe(
			"attention",
		);
		expect(componentStatus(part(5), facts({ planned: true }), thresholds)).toEqual({
			status: "planned",
			concern: "critical",
		});
	});

	test("a unit's is the worst of its own and its components'", () => {
		expect(rolledUpStatus(facts({ score: 1 }), [], thresholds)).toEqual(
			unitStatus(facts({ score: 1 }), thresholds),
		);
		expect(rolledUpStatus(facts({ score: 1 }), [part(2), part(5)], thresholds)).toEqual({
			status: "critical",
			concern: "critical",
		});
		expect(rolledUpStatus(facts({ score: 5 }), [part(2), part(1)], thresholds).status).toBe(
			"critical",
		);
		expect(rolledUpStatus(facts({ score: 1 }), [part(4), part(1)], thresholds).status).toBe(
			"attention",
		);
		expect(rolledUpStatus(facts(), [part(null)], thresholds).status).toBe("ok");
		// Planned while its work is in hand, keeping what's worst behind it.
		expect(
			rolledUpStatus(facts({ score: 1, planned: true }), [part(4), part(5)], thresholds),
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
