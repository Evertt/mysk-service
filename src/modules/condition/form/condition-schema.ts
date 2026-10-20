import * as v from "valibot";

import { optionalId, wholeIn } from "#lib/schema.ts";

import { ADVICE_MAX, scoreLimits } from "../model.ts";

/** A condition score in whole percents, 0–100. */
const score = () => wholeIn({ ...scoreLimits, message: m.condition_score_range });

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

/**
 * A unit's condition recorded in the office, or one of its components' (`componentId`, empty for
 * the unit as a whole): the fields of its dialog, with the unit's serial number.
 */
export const conditionSchema = v.object({
	serialNumber: v.pipe(v.string(), v.nonEmpty()),
	componentId: v.optional(optionalId(), ""),
	score: score(),
	advice: advice(),
});
