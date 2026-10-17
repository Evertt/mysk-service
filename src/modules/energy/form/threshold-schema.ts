import * as v from "valibot";

/** A threshold: a positive number, up to 100,000. */
const amount = () =>
	v.pipe(
		v.number(m.energy_threshold_amount),
		v.finite(m.energy_threshold_amount),
		v.gtValue(0, m.energy_threshold_amount),
		v.maxValue(100_000, m.energy_threshold_amount),
	);

/** A zone's thresholds: the fields of its row on the thresholds page. */
export const thresholdSchema = v.object({
	zoneId: v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)),
	// Unchecked boxes aren't submitted.
	enabled: v.optional(v.boolean(), false),
	maxKw: amount(),
	maxKwh: amount(),
});
