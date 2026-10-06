import * as v from "valibot";

import { fitsUnit, orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";
import { id, optionalDate, optionalId, text } from "#lib/schema.js";

/** The fields of the order form, shared by creating and editing an order. */
export const orderFields = {
	customerId: id("Choose a customer"),
	equipmentId: optionalId(),
	engineerId: optionalId(),
	type: v.picklist(orderTypes),
	status: v.picklist(orderStatuses),
	priority: v.picklist(orderPriorities),
	description: text("Describe the work"),
	scheduledFor: optionalDate(),
	laborHours: v.pipe(v.number("Enter the hours"), v.minValue(0, "Can't be negative")),
	lines: v.optional(
		v.array(
			v.object({
				materialId: id("Choose a material"),
				// Pieces are only counted whole; saving checks that against the material's unit.
				quantity: v.pipe(
					v.number("Enter a quantity"),
					v.gtValue(0, "More than 0"),
					v.check((quantity) => fitsUnit(quantity, "m"), "At most two decimals"),
				),
			}),
		),
		[],
	),
};
