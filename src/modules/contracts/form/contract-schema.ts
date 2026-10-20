import * as v from "valibot";

import { cents, date, id, wholeIn } from "#lib/schema.ts";

import { contractLevels } from "../model.ts";

/** The fields of the contract form, shared by creating and editing a contract. */
export const contractFields = {
	customerId: id(m.contracts_customer_required),
	level: v.picklist(contractLevels, m.validation_choose_one),
	startsOn: date(m.contracts_starts_required),
	endsOn: date(m.contracts_ends_required),
	monthlyFee: cents(m.contracts_fee_required),
	responseHours: wholeIn({
		min: 1,
		message: m.contracts_hours_required,
		fraction: m.contracts_hours_whole,
		tooLow: m.contracts_hours_min,
	}),
	notes: v.pipe(
		v.string(),
		v.trim(),
		v.transform((value) => value || null),
	),
	// Checkboxes, one per unit; unchecked ones aren't submitted, so none checked means no field.
	equipmentIds: v.pipe(
		v.optional(v.array(id(m.contracts_units_invalid)), []),
		v.minLength(1, m.contracts_units_required),
	),
};
