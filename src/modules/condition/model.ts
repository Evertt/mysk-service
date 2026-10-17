/**
 * The condition module's domain rules (SHLTR Connect, `docs/plans/shltr-domain.md` §2.3): a unit's
 * condition is a score from 0 to 100 with advice, recorded over time (the latest counts), and its
 * status follows from it, from its inspection (with checklists on) and from its open orders. Pure
 * and isomorphic; the same rules are in SQL for the lists (`server/status-sql.ts`).
 */

/** A unit's status, worst first: the order the Connect page sorts by. */
export const unitStatuses = ["critical", "attention", "planned", "ok"] as const;
export type UnitStatus = (typeof unitStatuses)[number];

/** What a unit's state asks for, whether or not its work is planned: its status without `planned`. */
export type Concern = Exclude<UnitStatus, "planned">;

/** The statuses that need someone's attention: the Connect page's "only these" filter. */
export const needsAttention = ["critical", "attention"] as const satisfies UnitStatus[];

/** Where a condition was recorded: on a checklist in the engineer portal, or by hand in the office. */
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
