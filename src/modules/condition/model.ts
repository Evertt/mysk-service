/**
 * The condition module's domain rules (SHLTR Connect, `docs/plans/shltr-domain.md` §2.3): a unit's
 * condition, and each of its components', is a score from 0 to 100 with advice, recorded over time
 * (the latest counts), and its status follows from it, from the unit's inspection (with checklists
 * on) and from its open orders; a unit's status is the worst of its own and its components'. Pure
 * and isomorphic; the same rules are in SQL for the lists (`server/status-sql.ts`).
 */
import type { NumberFormat } from "#lib/numbering.ts";

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

/** A condition score's range, in percent. */
export const scoreLimits = { min: 0, max: 100 } as const;

/** The most an advice may have. */
export const ADVICE_MAX = 500;

/** The scores below which a unit is critical and needs attention: the module's settings. */
export interface Thresholds {
	critical: number;
	attention: number;
}

/** The thresholds a tenant starts with: Kritiek below 40%, Aandacht below 70%. */
export const defaultThresholds: Thresholds = { critical: 40, attention: 70 };

/** A unit's inspection status as checklists has it (see its `inspectionStatus()`). */
export type InspectionState = "valid" | "expiring" | "expired" | "rejected" | "none";

/** What a unit's status is worked out from. */
export interface UnitFacts {
	/** Its latest condition's score, none without one. */
	score: number | null;
	/** Its latest condition's advice, if any: open advice, until a newer condition says otherwise. */
	advice: string | null;
	/** Its inspection status; null while the tenant has no checklists. */
	inspection: InspectionState | null;
	/** Whether an open order on it is scheduled (or under way): its work is in hand. */
	planned: boolean;
}

/**
 * What a unit's state asks for: `critical` when its score is below the critical threshold or its
 * inspection has expired; `attention` when its score is below the attention threshold, its latest
 * inspection rejected a point, or there's open advice; else `ok`.
 */
export function concernOf(facts: UnitFacts, thresholds: Thresholds): Concern {
	const { score, advice, inspection } = facts;
	if ((score !== null && score < thresholds.critical) || inspection === "expired") {
		return "critical";
	}
	if (
		(score !== null && score < thresholds.attention) ||
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

/** How a score shows: below the critical threshold, below the attention one, or fine. */
export type ScoreBand = "low" | "fair" | "good";

export function scoreBand(score: number, thresholds: Thresholds): ScoreBand {
	if (score < thresholds.critical) return "low";
	if (score < thresholds.attention) return "fair";
	return "good";
}

/** Whether the thresholds can be set so: both a score, critical below attention. */
export const validThresholds = ({ critical, attention }: Thresholds) =>
	Number.isInteger(critical) &&
	Number.isInteger(attention) &&
	critical > scoreLimits.min &&
	attention <= scoreLimits.max &&
	critical < attention;

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
