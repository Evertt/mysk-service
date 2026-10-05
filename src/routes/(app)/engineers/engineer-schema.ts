import * as v from "valibot";

import { engineerSpecialties } from "#lib/models.js";
import { cents, text } from "#lib/schema.js";

/** The regions engineers work in. Stored as text, so older records may hold other values. */
export const engineerRegions = ["North", "East", "South", "West", "Central"] as const;

/** The fields of the engineer form, shared by creating and editing an engineer. */
export const engineerFields = {
	name: text("Enter a name"),
	// Stops at the first problem, so an empty address isn't also reported as invalid.
	email: v.config(
		v.pipe(
			v.string(),
			v.trim(),
			v.nonEmpty("Enter an email address"),
			v.email("Enter a valid email address"),
			v.toLowerCase(),
		),
		{ abortPipeEarly: true },
	),
	phone: text("Enter a phone number"),
	specialty: v.picklist(engineerSpecialties, "Choose a specialty"),
	region: v.picklist(engineerRegions, "Choose a region"),
	hourlyRate: v.pipe(v.number("Enter an hourly rate"), cents()),
	hiredAt: v.pipe(
		v.string(),
		v.nonEmpty("Enter the hire date"),
		v.transform((value) => new Date(`${value}T00:00`)),
	),
	active: v.optional(v.boolean(), false),
};
