import * as v from "valibot";

import { ADVICE_MAX, scoreLimits } from "../model.ts";

/** A condition score in whole percents, 0–100. */
export const score = () =>
	v.pipe(
		v.number(m.condition_score_range),
		v.integer(m.condition_score_range),
		v.minValue(scoreLimits.min, m.condition_score_range),
		v.maxValue(scoreLimits.max, m.condition_score_range),
	);

/** The advice that goes with it; none when empty. */
export const advice = () =>
	v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.maxLength(ADVICE_MAX, (issue) => m.condition_advice_max({ max: issue.requirement })),
		),
		"",
	);

/** A unit's condition recorded in the office: the fields of its dialog, with the unit's serial number. */
export const conditionSchema = v.object({
	serialNumber: v.pipe(v.string(), v.nonEmpty()),
	score: score(),
	advice: advice(),
});
