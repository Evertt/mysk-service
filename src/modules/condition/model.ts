/**
 * The condition module's domain rules (SHLTR Connect, `docs/plans/shltr-domain.md` §2.3): a unit's
 * condition, and each of its components', is a record of its defects with advice, recorded over
 * time (the latest counts), scored on NEN 2767's scale from 1 (excellent) to 6 (very poor): each
 * element's defects by the norm's method (`nen2767.ts`), the worst element's score the record's. Its status follows from its score, from the unit's
 * inspection (with checklists on) and from its open orders; a unit's status is the worst of its own
 * and its components'. Pure and isomorphic; the same rules are in SQL for the lists
 * (`server/status-sql.ts`).
 */
import type { NumberFormat } from "#lib/numbering.ts";
import type { InspectionStatus } from "#modules/checklists/api/extensions.ts";

import {
	BEST_SCORE,
	type ConditionScore,
	type DefectGrade,
	elementScoreOf,
	WORST_SCORE,
	worstScore,
} from "./nen2767.ts";

/**
 * A unit's status, worst first: the order the Connect page sorts by.
 * @labels unitStatus
 */
export const unitStatuses = ["critical", "attention", "planned", "ok"] as const;
export type UnitStatus = (typeof unitStatuses)[number];

/** What a unit's state asks for, whether or not its work is planned: its status without `planned`. */
export type Concern = Exclude<UnitStatus, "planned">;

/** The statuses that need someone's attention: the Connect page's "only these" filter. */
export const needsAttention = ["critical", "attention"] as const satisfies UnitStatus[];

/**
 * Where a condition was recorded: on a checklist in the engineer portal, or by hand in the office.
 * @labels conditionSource
 */
export const conditionSources = ["checklist", "office"] as const;
export type ConditionSource = (typeof conditionSources)[number];

/** The most an advice may have. */
export const ADVICE_MAX = 500;

/** The most a defect's description may have. */
export const DEFECT_TEXT_MAX = 300;

/** How many defects a condition may have. */
export const DEFECTS_MAX = 30;

/**
 * The scores from which a unit is critical and needs attention ("vanaf"): the module's settings.
 * Both from 2 to 6, attention below critical (`validThresholds()`).
 */
export interface Thresholds {
	critical: number;
	attention: number;
}

/** The thresholds a tenant starts with: Kritiek from 5 (Slecht), Aandacht from 4 (Matig). */
export const defaultThresholds: Thresholds = { critical: 5, attention: 4 };

// --- Defects and scores ------------------------------------------------------------------------

/** A defect as its score is worked out: its grade, and the element it's on (none: the unit). */
export interface Defect extends DefectGrade {
	componentId: number | null;
}

/**
 * The grade of a rejected checklist point that wasn't given one (the office filled the checklist
 * in for the engineer, or it was rejected before conditions had defects): serious, advanced, 20% of
 * the element, which NEN 2767's tables score 2 (Goed).
 */
export const REJECTED_POINT_GRADE: DefectGrade = {
	severity: "serious",
	extent: 20,
	intensity: "advanced",
};

/**
 * The score of each element a condition's defects are on (`null`: the unit itself), by NEN 2767-1's
 * method over that element's defects (`elementScoreOf()`).
 */
export function elementScores(defects: readonly Defect[]): Map<number | null, ConditionScore> {
	const byElement = Map.groupBy(defects, (defect) => defect.componentId);
	return new Map([...byElement].map(([element, own]) => [element, elementScoreOf(own)]));
}

/** An element's score from its defects, by NEN 2767-1's method; 1 without defects. */
export const elementScore = (defects: readonly Defect[], componentId: number | null) =>
	elementScoreOf(defects.filter((each) => each.componentId === componentId));

/** A recorded defect as the pages show it, with its element and its photos' ids. */
export interface RecordedDefect extends DefectGrade {
	id: number;
	description: string;
	/** The component it's on, by number and name; none for the unit itself. */
	component: { id: number; number: string; name: string } | null;
	score: number;
	photos: { id: number }[];
}

/**
 * A condition's score: the worst of its elements' (each by NEN 2767-1's method over its own
 * defects), or 1 without defects. A component's condition has one element, the component.
 */
export const recordScore = (defects: readonly Defect[]) =>
	worstScore(elementScores(defects).values());

/**
 * A unit's current score: the worst of its own latest condition's and its components' latest
 * conditions' scores; none while none of them has one.
 */
export function currentScore(
	own: number | null,
	components: readonly (number | null)[],
): number | null {
	const known = [own, ...components].filter((score): score is number => score !== null);
	return known.length ? worstScore(known) : null;
}

/** What a unit's status is worked out from. */
export interface UnitFacts {
	/** Its latest condition's score, none without one. */
	score: number | null;
	/** Its latest condition's advice, if any: open advice, until a newer condition says otherwise. */
	advice: string | null;
	/** Its inspection status; null while the tenant has no checklists. */
	inspection: InspectionStatus | null;
	/** Whether an open order on it is scheduled (or under way): its work is in hand. */
	planned: boolean;
}

/**
 * What a unit's state asks for: `critical` when its score is at or past the critical threshold or
 * its inspection has expired; `attention` when its score is at or past the attention threshold, its
 * latest inspection rejected a point, or there's open advice; else `ok`.
 */
export function concernOf(facts: UnitFacts, thresholds: Thresholds): Concern {
	const { score, advice, inspection } = facts;
	if ((score !== null && score >= thresholds.critical) || inspection === "expired") {
		return "critical";
	}
	if (
		(score !== null && score >= thresholds.attention) ||
		inspection === "rejected" ||
		!!advice?.trim()
	) {
		return "attention";
	}
	return "ok";
}

/**
 * A unit's status: `planned` while its work is in hand (an open order on it is scheduled), whatever
 * its state asks for, which `concern` keeps (the small marker beside "Gepland"); else that concern.
 */
export function unitStatus(
	facts: UnitFacts,
	thresholds: Thresholds,
): { status: UnitStatus; concern: Concern } {
	const concern = concernOf(facts, thresholds);
	return { status: facts.planned ? "planned" : concern, concern };
}

/** A component's own facts: its latest condition's score and advice (none without one). */
export interface ComponentFacts {
	score: number | null;
	advice: string | null;
}

/** A status's place, worst first (`unitStatuses`): what the rollup and the sort go by. */
const statusRank = (status: UnitStatus) => unitStatuses.indexOf(status);

/**
 * A component's status: by the same rules as a unit's (`unitStatus()`), from its own latest
 * condition and its unit's inspection and planned work.
 */
export const componentStatus = (
	component: ComponentFacts,
	unit: UnitFacts,
	thresholds: Thresholds,
) => unitStatus({ ...unit, score: component.score, advice: component.advice }, thresholds);

/**
 * A unit's status with its components': the worst of its own (`unitStatus()`) and theirs
 * (`componentStatus()`), and the worst of what their states ask for. So a unit is critical while a
 * component of it is, and planned (whatever's behind it) while its work is in hand.
 */
export function rolledUpStatus(
	unit: UnitFacts,
	components: readonly ComponentFacts[],
	thresholds: Thresholds,
): { status: UnitStatus; concern: Concern } {
	const all = [
		unitStatus(unit, thresholds),
		...components.map((component) => componentStatus(component, unit, thresholds)),
	];
	const worst = <T extends UnitStatus>(statuses: T[]) =>
		statuses.reduce((a, b) => (statusRank(b) < statusRank(a) ? b : a));
	return {
		status: worst(all.map((each) => each.status)),
		concern: worst(all.map((each) => each.concern)),
	};
}

// --- Components --------------------------------------------------------------------------------

/** A component's number: `OC-0001`, as the mockup's codes. */
export const componentNumber: NumberFormat = { prefix: "OC-", digits: 4 };

/** The most a component's name may have. */
export const COMPONENT_NAME_MAX = 80;

/** How many components a unit may have. */
export const COMPONENTS_MAX = 50;

/**
 * Where a score stands against the tenant's thresholds, what the lists filter by: `low` from the
 * critical threshold on, `fair` from the attention one, else `good`.
 */
export type ScoreBand = "low" | "fair" | "good";

export function scoreBand(score: number, thresholds: Thresholds): ScoreBand {
	if (score >= thresholds.critical) return "low";
	if (score >= thresholds.attention) return "fair";
	return "good";
}

/** The range a threshold may be set in: 2 (Goed) to 6 (Zeer slecht). */
export const thresholdLimits = { min: BEST_SCORE + 1, max: WORST_SCORE } as const;

/** Whether the thresholds can be set so: both from 2 to 6, attention below critical. */
export const validThresholds = ({ critical, attention }: Thresholds) =>
	Number.isInteger(critical) &&
	Number.isInteger(attention) &&
	attention >= thresholdLimits.min &&
	critical <= thresholdLimits.max &&
	attention < critical;

// --- Planning critical units -------------------------------------------------------------------

/** Within how many working days a critical unit is to be planned ("binnen 5 werkdagen"). */
export const PLAN_WITHIN_WORKING_DAYS = 5;

/** Whether `day` is a working day: Monday to Friday (holidays aren't known). */
export const isWorkingDay = (day: Temporal.PlainDate) => day.dayOfWeek <= 5;

/**
 * The day `count` working days after `day`: Monday to Friday, `day` itself not counted, so 5
 * working days after a Monday is the next Monday, and after a Saturday the next Friday.
 */
export function addWorkingDays(day: Temporal.PlainDate, count: number): Temporal.PlainDate {
	let at = day;
	for (let left = count; left > 0;) {
		at = at.add({ days: 1 });
		if (isWorkingDay(at)) left--;
	}
	return at;
}
