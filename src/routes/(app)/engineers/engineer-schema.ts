import * as v from "valibot";

import { engineerSpecialties } from "#lib/models.js";
import { cents, date, email, phone, text } from "#lib/schema.js";

/** The regions engineers work in. Stored as text, so older records may hold other values. */
export const engineerRegions = ["North", "East", "South", "West", "Central"] as const;

/** The fields of the engineer form, shared by creating and editing an engineer. */
export const engineerFields = {
	name: text("Enter a name"),
	email: email(),
	phone: phone(),
	specialty: v.picklist(engineerSpecialties, "Choose a specialty"),
	region: v.picklist(engineerRegions, "Choose a region"),
	hourlyRate: cents("Enter an hourly rate"),
	hiredAt: date("Enter the hire date"),
	active: v.optional(v.boolean(), false),
};
