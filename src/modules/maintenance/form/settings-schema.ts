import * as v from "valibot";

import { wholeIn } from "#lib/schema.ts";

import { leadDayLimits } from "../model.ts";

const leadDaysMessage = () => m.maintenance_lead_days_range(leadDayLimits);

/** The organization's maintenance settings: the fields of its settings page. */
export const settingsSchema = v.object({
	// Unchecked boxes aren't submitted.
	autoCreate: v.optional(v.boolean(), false),
	leadDays: wholeIn({ ...leadDayLimits, message: leadDaysMessage }),
	remindCustomers: v.optional(v.boolean(), false),
});
