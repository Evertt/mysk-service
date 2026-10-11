import * as v from "valibot";

import { date, id, text } from "#lib/schema.ts";

import { intervalLimits, planOrderTypes } from "../model.ts";

const intervalMessage = () => m.maintenance_interval_range(intervalLimits);

/** A plan's interval in whole months, 1–60. */
const intervalMonths = () =>
	v.pipe(
		v.number(intervalMessage),
		v.integer(intervalMessage),
		v.minValue(intervalLimits.min, intervalMessage),
		v.maxValue(intervalLimits.max, intervalMessage),
	);

/** What the office says about a plan: the fields of its dialog. */
const planFields = {
	orderType: v.picklist(planOrderTypes),
	description: text(m.maintenance_description_required),
	intervalMonths: intervalMonths(),
	nextDueOn: date(m.maintenance_due_required),
};

/** A new plan for a unit (by its id, a hidden field). */
export const newPlanSchema = v.object({ equipmentId: id(), ...planFields });

/** A plan's new fields (by its id, a hidden field). */
export const planSchema = v.object({ id: id(), ...planFields });

/**
 * One plan for each of the contract's covered units without one (`equipmentIds`, checked on the
 * server): the contract card's bulk add. The first visit is due one interval from today.
 */
export const coveredPlansSchema = v.object({
	/** The units' ids, comma-separated (a hidden field). */
	equipmentIds: v.pipe(
		v.string(),
		v.regex(/^[1-9]\d{0,14}(?:,[1-9]\d{0,14})*$/, m.common_error_generic),
		// Sorted, as the card asks for the units' plans (`getCoveredPlans`), to refresh that.
		v.transform((ids) => [...new Set(ids.split(",").map(Number))].sort((a, b) => a - b)),
		v.maxLength(500, m.common_error_generic),
	),
	orderType: planFields.orderType,
	description: planFields.description,
	intervalMonths: planFields.intervalMonths,
});
