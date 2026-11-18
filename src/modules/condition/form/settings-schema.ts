import * as v from "valibot";

import { wholeIn } from "#lib/schema.ts";

import { thresholdLimits, validThresholds } from "../model.ts";

/** A threshold: a score on NEN 2767's scale from 2 to 6. */
const threshold = () => wholeIn({ ...thresholdLimits, message: m.condition_threshold_range });

/**
 * The organization's condition settings: the fields of its settings page, the scores from which a
 * unit is critical and needs attention (attention below critical), and whether critical units are
 * planned by themselves.
 */
export const settingsSchema = v.pipe(
	v.object({
		criticalFrom: threshold(),
		attentionFrom: threshold(),
		// Unchecked boxes aren't submitted.
		autoPlan: v.optional(v.boolean(), false),
	}),
	v.forward(
		v.check(
			(input) => validThresholds({ critical: input.criticalFrom, attention: input.attentionFrom }),
			m.condition_thresholds_order,
		),
		["attentionFrom"],
	),
);
