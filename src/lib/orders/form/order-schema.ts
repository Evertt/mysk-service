import * as v from "valibot";

import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.ts";
import { id, laborHours, optionalDate, optionalId, optionalTime, text } from "#lib/schema.ts";

import type { ModuleFormPart } from "../extensions.ts";

/** A module's part of the order form, as submitted: its own inputs, which it checks itself. */
const modulePart = v.custom<ModuleFormPart>(
	(value) => typeof value === "object" && value !== null && !Array.isArray(value),
);

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
	/**
	 * What the modules' parts of the form submit (see `orders.form`), by module id, as submitted:
	 * each module checks its own when the order is saved (`orders.saving`).
	 */
	modules: v.optional(v.record(v.string(), modulePart), {}),
};
