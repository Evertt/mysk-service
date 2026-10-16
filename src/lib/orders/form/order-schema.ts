import * as v from "valibot";

import { formPartsSchema, preflightParts } from "#lib/extensions/form-parts.ts";
import { formatNumber } from "#lib/i18n/format.ts";
import { manualOrderStatuses, orderPriorities, orderTypes } from "#lib/models.ts";
import { id, laborHours, optionalDate, optionalId, optionalTime, text } from "#lib/schema.ts";

/**
 * The modules' parts of the order form (see `orders.form`), by module id, each validated by its
 * schema: on the server with the order's fields, and in the browser before it's submitted.
 */
const modules = formPartsSchema("orders.form");

/** The most units an order can be about, e.g. every door of a large distribution centre. */
export const MAX_ORDER_UNITS = 200;

/** The fields of the order form, shared by creating and editing an order. */
export const orderFields = {
	customerId: id(m.orders_choose_customer),
	/**
	 * The customer's units it's about, in the order they're worked on: a checkbox each, in that
	 * order. None (no field at all) for a new installation or a survey.
	 */
	equipmentIds: v.pipe(
		v.optional(v.array(id(m.orders_units_invalid)), []),
		v.maxLength(MAX_ORDER_UNITS, () =>
			m.orders_units_too_many({ max: formatNumber(MAX_ORDER_UNITS) }),
		),
	),
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
