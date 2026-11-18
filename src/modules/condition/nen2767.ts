/**
 * The NEN 2767 condition scale and how a defect ("gebrek") is scored on it: the one place that
 * knows the standard's numbers, so they're easy to check and correct. Pure and isomorphic; the
 * condition module's rules (`model.ts`) work with what this answers.
 *
 * A condition is a score from 1 (excellent) to 6 (very poor). A defect is scored by its severity
 * ("ernst"), its extent over the element ("omvang", NEN's classes 1 to 5) and its intensity
 * ("intensiteit"): `defectScore()` reads it from the tables below.
 */

/** The scale, best first: 1 Uitstekend … 6 Zeer slecht. */
export const conditionScores = [1, 2, 3, 4, 5, 6] as const;
export type ConditionScore = (typeof conditionScores)[number];

/** The best score: an element without defects. */
export const BEST_SCORE: ConditionScore = 1;
/** The worst score. */
export const WORST_SCORE: ConditionScore = 6;

/** Whether `value` is a score on the scale. */
export const isConditionScore = (value: unknown): value is ConditionScore =>
	Number.isInteger(value) && (value as number) >= BEST_SCORE && (value as number) <= WORST_SCORE;

/**
 * How severe a defect is ("ernst"): gering (slight), serieus (serious), ernstig (severe).
 * @labels defectSeverity
 */
export const defectSeverities = ["slight", "serious", "severe"] as const;
export type DefectSeverity = (typeof defectSeverities)[number];

/**
 * How far a defect has come ("intensiteit"): beginstadium (initial), gevorderd stadium (advanced),
 * eindstadium (final).
 * @labels defectIntensity
 */
export const defectIntensities = ["initial", "advanced", "final"] as const;
export type DefectIntensity = (typeof defectIntensities)[number];

/**
 * How much of the element a defect covers ("omvang"), as NEN's classes: 1 below 2%, 2 from 2 to
 * 10%, 3 from 10 to 30%, 4 from 30 to 70%, 5 70% or more.
 */
export const defectExtents = [1, 2, 3, 4, 5] as const;
export type DefectExtent = (typeof defectExtents)[number];

/** Whether `value` is one of the extent classes. */
export const isDefectExtent = (value: unknown): value is DefectExtent =>
	Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 5;

/**
 * The scores of a defect, after NEN 2767-1 (the tables of "ernst", "omvang" and "intensiteit"): per
 * severity, a row per intensity (initial, advanced, final) and in it a column per extent class
 * (1 to 5). Correct them here, and the spec beside it (`tests/unit/nen2767.spec.ts`), if the
 * standard says otherwise.
 */
const SCORE_TABLES: Record<
	DefectSeverity,
	Record<DefectIntensity, readonly [number, number, number, number, number]>
> = {
	severe: {
		initial: [1, 2, 3, 4, 5],
		advanced: [2, 3, 4, 5, 6],
		final: [3, 4, 5, 6, 6],
	},
	serious: {
		initial: [1, 1, 2, 3, 4],
		advanced: [1, 2, 3, 4, 5],
		final: [2, 3, 4, 5, 6],
	},
	slight: {
		initial: [1, 1, 1, 2, 3],
		advanced: [1, 1, 2, 3, 4],
		final: [1, 2, 3, 4, 5],
	},
};

/** What a defect is scored by. */
export interface DefectGrade {
	severity: DefectSeverity;
	extent: DefectExtent;
	intensity: DefectIntensity;
}

/** A defect's score on the scale, from NEN 2767's tables (above). */
export const defectScore = ({ severity, extent, intensity }: DefectGrade): ConditionScore =>
	SCORE_TABLES[severity][intensity][extent - 1] as ConditionScore;

/** The worst (highest) of `scores`, or 1 (no defects) for none. */
export const worstScore = (scores: Iterable<number>): ConditionScore => {
	let worst: number = BEST_SCORE;
	for (const score of scores) if (score > worst) worst = score;
	return worst as ConditionScore;
};

/**
 * A score from the 0–100% the module kept before NEN 2767, by band: 90% or more is 1, 80–89% 2,
 * 70–79% 3, 40–69% 4, 20–39% 5, below 20% 6. The conversion's migration does the same in SQL, on
 * the conditions and the thresholds.
 */
export function scoreOfPercent(percent: number): ConditionScore {
	if (percent >= 90) return 1;
	if (percent >= 80) return 2;
	if (percent >= 70) return 3;
	if (percent >= 40) return 4;
	if (percent >= 20) return 5;
	return 6;
}
