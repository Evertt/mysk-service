import * as v from "valibot";

import { engineerSpecialties } from "#lib/models.ts";
import { cents, date, email, phone, text } from "#lib/schema.ts";

import { engineerRegions } from "../display.ts";

/** The fields of the engineer form, shared by creating and editing an engineer. */
export const engineerFields = {
	name: text(m.engineers_name_required),
	email: email(),
	phone: phone(),
	specialty: v.picklist(engineerSpecialties, m.engineers_specialty_required),
	region: v.picklist(engineerRegions, m.engineers_region_required),
	hourlyRate: cents(m.engineers_hourly_rate_required),
	hiredAt: date(m.engineers_hired_required),
	active: v.optional(v.boolean(), false),
};
