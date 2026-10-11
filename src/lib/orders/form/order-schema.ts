import * as v from "valibot";

import { formPartsSchema, preflightParts } from "#lib/extensions/form-parts.ts";
import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.ts";
import { id, laborHours, optionalDate, optionalId, optionalTime, text } from "#lib/schema.ts";

/**
 * The modules' parts of the order form (see `orders.form`), by module id, each validated by its
 * schema: on the server with the order's fields, and in the browser before it's submitted.
 */
const modules = formPartsSchema("orders.form");

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
	/** The modules' parts of the form, saved with the order (`orders.saving`). */
	modules,
};

/**
 * What the browser checks before submitting the order form, new or edited: only the modules' parts,
 * so their fields show what's wrong without a request. The order's own fields are checked by the
 * server, as they were. (With the edit form's `id`, so it types as either form's schema.)
 */
export const orderFormPreflight = preflightParts(v.object({ id: id(), ...orderFields }));
