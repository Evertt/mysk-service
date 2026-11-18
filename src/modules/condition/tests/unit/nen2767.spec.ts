/**
 * NEN 2767-1:2017's scoring (`nen2767.ts`): the norm's method for an element's defects (categories
 * by severity and intensity, their extents added up to a class, points per category, the total
 * banded to a score), with the norm's own example; and the single-defect tables as the norm has
 * them, which the method on one defect must give cell by cell. Correct these tables and the
 * method's numbers in `nen2767.ts` together.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	defectCategory,
	defectIntensities,
	defectScore,
	type DefectSeverity,
	elementScoreOf,
	extentClass,
	extentClasses,
	extentPresets,
	isConditionScore,
	pointsOf,
	scoreOfPoints,
	worstScore,
} from "#modules/condition/nen2767.ts";

/** The single-defect tables: per severity, a row per intensity, a column per extent class. */
const tables: Record<DefectSeverity, Record<"initial" | "advanced" | "final", number[]>> = {
	severe: { initial: [1, 1, 2, 3, 4], advanced: [1, 2, 3, 4, 5], final: [2, 3, 4, 5, 6] },
	serious: { initial: [1, 1, 1, 2, 3], advanced: [1, 1, 2, 3, 4], final: [1, 2, 3, 4, 5] },
	slight: { initial: [1, 1, 1, 1, 2], advanced: [1, 1, 1, 2, 3], final: [1, 1, 2, 3, 4] },
};

const cells = Object.entries(tables).flatMap(([severity, rows]) =>
	defectIntensities.flatMap((intensity) =>
		extentClasses.map((extent) => ({
			severity: severity as DefectSeverity,
			intensity,
			extent,
			score: rows[intensity][extent - 1],
		})),
	),
);

describe("a single defect", () => {
	test.each(cells)(
		"$severity, $intensity, extent class $extent is $score, at any extent in the class",
		({ severity, intensity, extent, score }) => {
			const bounds = { 1: [1, 1], 2: [2, 9], 3: [10, 29], 4: [30, 69], 5: [70, 100] }[extent];
			for (const percent of [...bounds, extentPresets[extent]]) {
				expect(defectScore({ severity, intensity, extent: percent }), `${percent}%`).toBe(score);
			}
		},
	);

	test("never gets better with more extent, intensity or severity", () => {
		for (const percent of [1, 5, 20, 50, 85]) {
			for (const intensity of defectIntensities) {
				const slight = defectScore({ severity: "slight", intensity, extent: percent });
				const serious = defectScore({ severity: "serious", intensity, extent: percent });
				const severe = defectScore({ severity: "severe", intensity, extent: percent });
				expect(serious).toBeGreaterThanOrEqual(slight);
				expect(severe).toBeGreaterThanOrEqual(serious);
			}
		}
		for (const { severity, intensity, extent, score } of cells) {
			if (extent < 5) {
				expect(tables[severity][intensity][extent]).toBeGreaterThanOrEqual(score);
			}
		}
	});
});

describe("the norm's method for an element's defects", () => {
	test("a defect's category is its severity and intensity", () => {
		expect(defectCategory({ severity: "slight", intensity: "initial" })).toBe(1);
		expect(defectCategory({ severity: "slight", intensity: "advanced" })).toBe(2);
		expect(defectCategory({ severity: "serious", intensity: "initial" })).toBe(2);
		expect(defectCategory({ severity: "slight", intensity: "final" })).toBe(3);
		expect(defectCategory({ severity: "serious", intensity: "advanced" })).toBe(3);
		expect(defectCategory({ severity: "severe", intensity: "initial" })).toBe(3);
		expect(defectCategory({ severity: "serious", intensity: "final" })).toBe(4);
		expect(defectCategory({ severity: "severe", intensity: "advanced" })).toBe(4);
		expect(defectCategory({ severity: "severe", intensity: "final" })).toBe(5);
	});

	test("the extent classes: below 2, 10, 30 and 70%", () => {
		expect([1, 1.9, 2, 9, 10, 29, 30, 69, 70, 100].map(extentClass)).toEqual([
			1, 1, 2, 2, 3, 3, 4, 4, 5, 5,
		]);
		expect(Object.values(extentPresets).map(extentClass)).toEqual([1, 2, 3, 4, 5]);
	});

	test("the points' total gives the score: up to 1.2, 2, 10, 30, 70, beyond", () => {
		expect([0, 12, 13, 20, 21, 100, 101, 300, 301, 700, 701, 1000].map(scoreOfPoints)).toEqual([
			1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
		]);
	});

	test("the norm's example: a window frame scores 5, at 32.6 points", () => {
		const frame = [
			// Category 5 at 20%: 30 points.
			{ severity: "severe", intensity: "final", extent: 20 },
			// Category 3, 8% and 5%, so 13%: 2 points.
			{ severity: "serious", intensity: "advanced", extent: 8 },
			{ severity: "slight", intensity: "final", extent: 5 },
			// Category 1 at 25%: 0.6 points.
			{ severity: "slight", intensity: "initial", extent: 25 },
		] as const;
		expect(pointsOf(frame)).toBe(326);
		expect(elementScoreOf(frame)).toBe(5);
	});

	test("a category's extents add up, at most 100%, and several defects can score worse than each", () => {
		const crack = { severity: "serious", intensity: "advanced", extent: 6 } as const;
		// Alone 2 points' worth of 1.2: 1; three of them, 18%: 2 points, so 2.
		expect(defectScore(crack)).toBe(1);
		expect(elementScoreOf([crack, crack, crack])).toBe(2);
		const rot = { severity: "severe", intensity: "final", extent: 60 } as const;
		expect(elementScoreOf([rot, rot])).toBe(6);
		expect(pointsOf([rot, rot])).toBe(1000);
	});

	test("without defects, 1", () => {
		expect(elementScoreOf([])).toBe(1);
		expect(pointsOf([])).toBe(0);
	});
});

test("the worst score wins, 1 without any", () => {
	expect(worstScore([])).toBe(1);
	expect(worstScore([2, 5, 3])).toBe(5);
});

test("scores are whole numbers on the scale", () => {
	expect([0, 1, 6, 7, 2.5, "3"].map(isConditionScore)).toEqual([
		false,
		true,
		true,
		false,
		false,
		false,
	]);
});
