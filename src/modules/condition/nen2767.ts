/**
 * The NEN 2767 condition scale and how an element's defects ("gebreken") are scored on it, after
 * NEN 2767-1:2017: the one place that knows the standard's numbers, so they're easy to check and
 * correct. Pure and isomorphic; the condition module's rules (`model.ts`) work with what this
 * answers.
 *
 * A condition is a score from 1 (excellent) to 6 (very poor). A defect has a severity ("ernst"), an
 * intensity ("intensiteit") and an extent over the element ("omvang", a percentage, whose class is
 * 1 to 5). The norm's method scores an element (`elementScoreOf()`): each defect's severity and
 * intensity make its category (1–5); the extents of the defects of one category add up (at most
 * 100%) to an extent class; each category's class gives points (`CATEGORY_POINTS`); the points add
 * up to a total, whose band is the score (`scoreOfPoints()`). One defect alone so scores as the
 * norm's single-defect tables have it (`defectScore()`; `tests/unit/nen2767.spec.ts` holds the
 * tables and checks every cell, and the norm's own example).
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
 * NEN's extent classes ("omvang"): 1 below 2%, 2 from 2 to below 10%, 3 from 10 to below 30%, 4 from
 * 30 to below 70%, 5 70% or more of the element.
 */
export const extentClasses = [1, 2, 3, 4, 5] as const;
export type ExtentClass = (typeof extentClasses)[number];

/** A defect's extent's bounds, in whole percents of the element. */
export const extentLimits = { min: 1, max: 100 } as const;

/** The percentage each class's chip sets, a typical extent of it: 1, 5, 20, 50 and 85%. */
export const extentPresets: Record<ExtentClass, number> = { 1: 1, 2: 5, 3: 20, 4: 50, 5: 85 };

/** The class of an extent in percent (or of a sum of them, at most 100%). */
export function extentClass(percent: number): ExtentClass {
	if (percent < 2) return 1;
	if (percent < 10) return 2;
	if (percent < 30) return 3;
	if (percent < 70) return 4;
	return 5;
}

/** What a defect is scored by: its severity, intensity and extent in percent of the element. */
export interface DefectGrade {
	severity: DefectSeverity;
	intensity: DefectIntensity;
	/** In whole percents of the element, 1–100. */
	extent: number;
}

/** A defect's category, 1 to 5, by its severity and intensity, after NEN 2767-1. */
type DefectCategory = 1 | 2 | 3 | 4 | 5;

const CATEGORIES: Record<DefectSeverity, Record<DefectIntensity, DefectCategory>> = {
	slight: { initial: 1, advanced: 2, final: 3 },
	serious: { initial: 2, advanced: 3, final: 4 },
	severe: { initial: 3, advanced: 4, final: 5 },
};

/** A defect's category: 1 slight initial … 5 severe final. */
export const defectCategory = ({ severity, intensity }: Omit<DefectGrade, "extent">) =>
	CATEGORIES[severity][intensity];

/**
 * The points of a category by its defects' extent class (1–5), after NEN 2767-1, in tenths (so
 * adding them up is exact): category 1 0.1, 0.2, 0.6, 1.2, 2; … category 5 2, 10, 30, 70, 100.
 */
const CATEGORY_POINTS: Record<DefectCategory, readonly [number, number, number, number, number]> = {
	1: [1, 2, 6, 12, 20],
	2: [2, 6, 12, 20, 100],
	3: [6, 12, 20, 100, 300],
	4: [12, 20, 100, 300, 700],
	5: [20, 100, 300, 700, 1000],
};

/** The score of a total of points (in tenths): up to 1.2 is 1, 2 is 2, 10 is 3, 30 is 4, 70 is 5. */
export function scoreOfPoints(tenths: number): ConditionScore {
	if (tenths <= 12) return 1;
	if (tenths <= 20) return 2;
	if (tenths <= 100) return 3;
	if (tenths <= 300) return 4;
	if (tenths <= 700) return 5;
	return 6;
}

/**
 * The points of an element's defects, in tenths (NEN 2767-1's method): per category, the class of
 * its defects' extents added up (at most 100%), and its points by that class; added up.
 */
export function pointsOf(defects: readonly DefectGrade[]): number {
	const extents = new Map<DefectCategory, number>();
	for (const defect of defects) {
		const category = defectCategory(defect);
		extents.set(category, Math.min(100, (extents.get(category) ?? 0) + defect.extent));
	}
	let tenths = 0;
	for (const [category, extent] of extents) {
		tenths += CATEGORY_POINTS[category][extentClass(extent) - 1];
	}
	return tenths;
}

/** An element's score from its defects, by NEN 2767-1's method; 1 without defects. */
export const elementScoreOf = (defects: readonly DefectGrade[]): ConditionScore =>
	scoreOfPoints(pointsOf(defects));

/** One defect's score, as the norm's single-defect tables have it: the method on it alone. */
export const defectScore = (defect: DefectGrade): ConditionScore => elementScoreOf([defect]);

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
