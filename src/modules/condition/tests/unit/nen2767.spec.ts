/**
 * NEN 2767's scoring of a defect (`defectScore()`), cell by cell against the standard's tables as
 * NEN 2767-1 has them: per severity, a row per intensity and a column per extent class. Correct
 * this table and the one in `nen2767.ts` together.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	type DefectExtent,
	type DefectIntensity,
	defectExtents,
	defectIntensities,
	defectScore,
	type DefectSeverity,
	isConditionScore,
	isDefectExtent,
	worstScore,
} from "#modules/condition/nen2767.ts";

const tables: Record<DefectSeverity, Record<DefectIntensity, number[]>> = {
	severe: { initial: [1, 2, 3, 4, 5], advanced: [2, 3, 4, 5, 6], final: [3, 4, 5, 6, 6] },
	serious: { initial: [1, 1, 2, 3, 4], advanced: [1, 2, 3, 4, 5], final: [2, 3, 4, 5, 6] },
	slight: { initial: [1, 1, 1, 2, 3], advanced: [1, 1, 2, 3, 4], final: [1, 2, 3, 4, 5] },
};

const cells = Object.entries(tables).flatMap(([severity, rows]) =>
	defectIntensities.flatMap((intensity) =>
		defectExtents.map((extent) => ({
			severity: severity as DefectSeverity,
			intensity,
			extent: extent as DefectExtent,
			score: rows[intensity][extent - 1],
		})),
	),
);

describe("a defect's score", () => {
	test.each(cells)(
		"$severity, $intensity, extent $extent is $score",
		({ severity, intensity, extent, score }) => {
			expect(defectScore({ severity, intensity, extent })).toBe(score);
		},
	);

	test("never gets better with more extent, intensity or severity", () => {
		for (const { severity, intensity, extent, score } of cells) {
			if (extent < 5) {
				const wider = defectScore({ severity, intensity, extent: (extent + 1) as DefectExtent });
				expect(wider).toBeGreaterThanOrEqual(score);
			}
		}
		for (const extent of defectExtents) {
			for (const intensity of defectIntensities) {
				const slight = defectScore({ severity: "slight", intensity, extent });
				const serious = defectScore({ severity: "serious", intensity, extent });
				const severe = defectScore({ severity: "severe", intensity, extent });
				expect(serious).toBeGreaterThanOrEqual(slight);
				expect(severe).toBeGreaterThanOrEqual(serious);
			}
		}
	});
});

test("the worst score wins, 1 without any", () => {
	expect(worstScore([])).toBe(1);
	expect(worstScore([2, 5, 3])).toBe(5);
	expect(worstScore([1])).toBe(1);
});

test("scores and extents are whole numbers on their scales", () => {
	expect([0, 1, 6, 7, 2.5, "3"].map(isConditionScore)).toEqual([
		false,
		true,
		true,
		false,
		false,
		false,
	]);
	expect([0, 1, 5, 6].map(isDefectExtent)).toEqual([false, true, true, false]);
});
