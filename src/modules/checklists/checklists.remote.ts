/**
 * The checklists on orders as the office reads them: an order's (its page's card), the work order
 * to print with its signatures, and a unit's history and inspection status (its page). Every office
 * member reads them; only engineers change them, in the portal (`portal/field-checklists.remote.ts`).
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";

import { query } from "./remote-functions.ts";
import { checklistRecords, withPointArticles } from "./server/records.ts";
import { checklist } from "./server/schema.ts";
import { unitInspection } from "./server/unit-inspection.ts";
import { loadWorkOrder } from "./server/work-order.ts";

/** The tenant's order `number`'s id, or a 404. */
async function orderId(number: string) {
	const [found] = await db
		.select({ id: order.id })
		.from(order)
		.where(and(eq(order.number, number), inTenant(order)));
	if (!found) error(404, m.checklists_order_not_found({ number }));
	return found.id;
}

/** The checklists of the tenant's order `number`, one per unit that has one, in the units' order. */
export const getOrderChecklists = query(v.string(), async (number) => ({
	checklists: await withPointArticles(
		await checklistRecords(eq(checklist.orderId, await orderId(number))),
	),
}));

/**
 * The tenant's order `number` as its work order (werkbon) prints it: the order, its customer, the
 * sites of its units, its engineer, every checklist and the sign-off with both signatures.
 */
export const getWorkOrder = query(v.string(), async (number) => {
	const found = await loadWorkOrder(eq(order.number, number));
	if (!found) error(404, m.checklists_order_not_found({ number }));
	return found;
});

/**
 * The checklists of the tenant's unit `serialNumber` (or a 404), newest first, and its inspection
 * status today, by its latest completed inspection.
 */
export const getUnitChecklists = query(v.string(), async (serialNumber) => {
	const [unit] = await db
		.select({ id: equipment.id })
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.checklists_equipment_not_found({ serial: serialNumber }));
	return unitInspection(unit.id);
});
