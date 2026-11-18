/**
 * Maintenance as a customer's contact reads it in the customer portal: when one of their
 * customer's units was last maintained, for the facts on its page (`client.unit.facts`). Only the
 * day and the order it was, which the contact may open: not the plans, their intervals or what
 * the visits cost. Gated by `forCustomers` (the module's set for customers' contacts) and scoped
 * to their customer and the sites they see (`#lib/server/auth/customer.ts`), so another
 * customer's unit is a 404, also by a tampered serial number.
 */
import { and, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { doneOrderStatuses } from "#lib/models.ts";
import {
	currentCustomer,
	customerEquipment,
	customerOrders,
	inTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { planOrderTypes } from "../model.ts";
import { forCustomers } from "../remote-functions.ts";

/**
 * The customer's unit `serialNumber` (or a 404) and its last maintenance: the latest of its done
 * orders of the kinds a plan makes (`planOrderTypes`) that the contact sees, its number and when it
 * was completed; null before the first.
 */
export const getClientLastMaintenance = forCustomers.query(v.string(), async (serialNumber) => {
	const access = await currentCustomer();
	const unit = orNotFound(
		await db
			.select({ id: equipment.id })
			.from(equipment)
			.where(and(eq(equipment.serialNumber, serialNumber), customerEquipment(access))),
		m.client_unit_not_found({ serial: serialNumber }),
	);
	const [last] = await db
		.select({ number: order.number, completedAt: order.completedAt })
		.from(orderUnit)
		.innerJoin(...tenantJoin(order, orderUnit.orderId))
		.where(
			and(
				eq(orderUnit.equipmentId, unit.id),
				inTenant(orderUnit),
				customerOrders(access),
				inList(order.status, doneOrderStatuses),
				inList(order.type, planOrderTypes),
			),
		)
		.orderBy(desc(order.completedAt), desc(order.id))
		.limit(1);
	return { unitId: unit.id, last: last ?? null };
});
