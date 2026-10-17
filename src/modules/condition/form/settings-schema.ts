import * as v from "valibot";

import { validThresholds } from "../model.ts";

/** A threshold: a whole percentage from 1 to 100. */
const threshold = () =>
	v.pipe(
		v.number(m.condition_threshold_range),
		v.integer(m.condition_threshold_range),
		v.minValue(1, m.condition_threshold_range),
		v.maxValue(100, m.condition_threshold_range),
	);

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
