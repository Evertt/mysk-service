import * as v from "valibot";

import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";
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
	laborHours: v.pipe(v.number(), v.minValue(0, "Can't be negative")),
	lines: v.optional(
		v.array(
			v.object({
				materialId: id("Choose a material"),
				quantity: v.pipe(v.number(), v.integer(), v.minValue(1, "At least 1")),
			}),
		),
		[],
	),
};
