import * as v from "valibot";

import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.js";
import { id, laborHours, optionalDate, optionalId, orderLines, text } from "#lib/schema.js";

/** The fields of the order form, shared by creating and editing an order. */
export const orderFields = {
	customerId: id("Choose a customer"),
	equipmentId: optionalId(),
	engineerId: optionalId(),
	type: v.picklist(orderTypes),
	// Not `invoiced`: only issuing an invoice makes an order invoiced.
	status: v.picklist(manualOrderStatuses),
	priority: v.picklist(orderPriorities),
	description: text("Describe the work"),
	scheduledFor: optionalDate(),
	laborHours: laborHours(),
	lines: orderLines(),
};
