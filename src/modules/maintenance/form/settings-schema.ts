import * as v from "valibot";

import { leadDayLimits } from "../model.ts";

const leadDaysMessage = () => m.maintenance_lead_days_range(leadDayLimits);

/** The organization's maintenance settings: the fields of its settings page. */
export const settingsSchema = v.object({
	// Unchecked boxes aren't submitted.
	autoCreate: v.optional(v.boolean(), false),
	leadDays: v.pipe(
		v.number(leadDaysMessage),
		v.integer(leadDaysMessage),
		v.minValue(leadDayLimits.min, leadDaysMessage),
		v.maxValue(leadDayLimits.max, leadDaysMessage),
	),
	remindCustomers: v.optional(v.boolean(), false),
});
