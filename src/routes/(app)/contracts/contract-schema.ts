import * as v from "valibot";

import { contractLevels } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { cents, date, id } from "#lib/schema.js";

/** The fields of the contract form, shared by creating and editing a contract. */
export const contractFields = {
	customerId: id(m.contracts_customer_required),
	level: v.picklist(contractLevels, m.validation_choose_one),
	startsOn: date(m.contracts_starts_required),
	endsOn: date(m.contracts_ends_required),
	monthlyFee: cents(m.contracts_fee_required),
	responseHours: v.pipe(
		v.number(m.contracts_hours_required),
		v.integer(m.contracts_hours_whole),
		v.minValue(1, m.contracts_hours_min),
	),
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
