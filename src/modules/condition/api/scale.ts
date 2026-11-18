/**
 * The condition module's NEN 2767 scale, for the modules that show its scores: the checklists
 * module's work orders page shows a component's score as the condition module does ("3 ·
 * Redelijk", in its colour), and the score its points give it while the office fills them in.
 * Isomorphic.
 */
import { REJECTED_POINT_GRADE } from "../model.ts";
import { defectScore } from "../nen2767.ts";

export { scoreColours, scoreLabel, scoreText } from "../display.ts";
export { type ConditionScore, isConditionScore } from "../nen2767.ts";

/**
 * The score a checklist's points give a unit or component when the office fills it in (its rejected
 * points without a grade of their own, `REJECTED_POINT_GRADE`): 1 without a rejected point, that
 * grade's score with one, none while no point counts (all not applicable or unanswered).
 */
export function pointsScore(results: readonly { result: string | null }[]): number | null {
	if (!results.some((each) => each.result === "ok" || each.result === "nok")) return null;
	return results.some((each) => each.result === "nok") ? defectScore(REJECTED_POINT_GRADE) : 1;
}
