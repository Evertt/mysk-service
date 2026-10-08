import * as v from "valibot";

import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.ts";
import { m } from "#lib/paraglide/messages.js";
import {
	id,
	laborHours,
	optionalDate,
	optionalId,
	optionalTime,
	orderLines,
	text,
} from "#lib/schema.ts";

/** The fields of the order form, shared by creating and editing an order. */
export const orderFields = {
	customerId: id(m.orders_choose_customer),
	equipmentId: optionalId(),
	engineerId: optionalId(),
	type: v.picklist(orderTypes),
	// Not `invoiced`: only issuing an invoice makes an order invoiced.
	status: v.picklist(manualOrderStatuses),
	priority: v.picklist(orderPriorities),
	description: text(m.orders_description_required),
	/** The day it's planned for, at `scheduledTime` (or the start of the day). */
	scheduledFor: optionalDate(),
	scheduledTime: optionalTime(),
	laborHours: laborHours(),
	lines: orderLines(),
};
