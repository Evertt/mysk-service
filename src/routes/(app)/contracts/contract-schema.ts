import * as v from "valibot";

import { contractLevels } from "#lib/models.js";
import { cents, date, id } from "#lib/schema.js";

/** The fields of the contract form, shared by creating and editing a contract. */
export const contractFields = {
	customerId: id("Choose a customer"),
	level: v.picklist(contractLevels),
	startsOn: date("Choose the first day"),
	endsOn: date("Choose the last day"),
	monthlyFee: cents("Enter the monthly fee"),
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
		v.optional(v.array(id("Choose units from the list")), []),
		v.minLength(1, "Choose at least one unit"),
	),
};
