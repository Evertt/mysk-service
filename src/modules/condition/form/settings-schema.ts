import * as v from "valibot";

import { wholeIn } from "#lib/schema.ts";

import { validThresholds } from "../model.ts";

/** A threshold: a whole percentage from 1 to 100. */
const threshold = () => wholeIn({ min: 1, max: 100, message: m.condition_threshold_range });

/** The organization's condition settings: the fields of its settings page. */
export const settingsSchema = v.pipe(
	v.object({
		criticalBelow: threshold(),
		attentionBelow: threshold(),
		// Unchecked boxes aren't submitted.
		autoPlan: v.optional(v.boolean(), false),
	}),
	v.forward(
		v.check(
			(input) =>
				validThresholds({ critical: input.criticalBelow, attention: input.attentionBelow }),
			m.condition_thresholds_order,
		),
		["criticalBelow"],
	),
);
