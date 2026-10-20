import * as v from "valibot";

import { id, numberIn } from "#lib/schema.ts";

/** A threshold: a positive number, up to 100,000. */
const amount = () => numberIn({ above: true, max: 100_000, message: m.energy_threshold_amount });

/** A zone's thresholds: the fields of its row on the thresholds page. */
export const thresholdSchema = v.object({
	zoneId: id(),
	// Unchecked boxes aren't submitted.
	enabled: v.optional(v.boolean(), false),
	maxKw: amount(),
	maxKwh: amount(),
});
