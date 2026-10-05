import * as v from "valibot";

import { contractLevels } from "#lib/models.js";
import { cents, id } from "#lib/schema.js";

/** A required date from `<input type="date">`, as a local date at the start of the day. */
const date = (message: string) =>
	v.pipe(
		v.string(),
		v.nonEmpty(message),
		v.isoDate(message),
		v.transform((value) => new Date(`${value}T00:00`)),
	);

/** The fields of the contract form, shared by creating and editing a contract. */
export const contractFields = {
	customerId: id("Choose a customer"),
	level: v.picklist(contractLevels),
	startsOn: date("Choose the first day"),
	endsOn: date("Choose the last day"),
	monthlyFee: v.pipe(v.number("Enter the monthly fee"), cents()),
	responseHours: v.pipe(
		v.number("Enter a number of hours"),
		v.integer("Whole hours only"),
		v.minValue(1, "At least 1 hour"),
	),
	notes: v.pipe(
		v.string(),
		v.trim(),
		v.transform((value) => value || null),
	),
	// Checkboxes, one per unit; unchecked ones aren't submitted, so none checked means no field.
	equipmentIds: v.pipe(
		v.optional(v.array(v.string()), []),
		v.minLength(1, "Choose at least one unit"),
		v.transform((ids) => ids.map(Number)),
	),
};
