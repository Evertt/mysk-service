/**
 * The checklists on orders as the office reads them: an order's (its page's card), the work order
 * to print with its signatures, and a unit's history and inspection status (its page). Every office
 * member reads them; only engineers change them, in the portal (`portal/field-checklists.remote.ts`).
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { unitBySerial } from "#lib/equipment/server/index.ts";
import { orderByNumber } from "#lib/orders/server/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { readAt } from "#lib/server/live.ts";
import { orNotFound } from "#lib/server/records.ts";

import { query } from "./remote-functions.ts";
import { checklistRecords, withPointArticles } from "./server/records.ts";
import { checklist } from "./server/schema.ts";
import { unitInspection } from "./server/unit-inspection.ts";
import { loadWorkOrder } from "./server/work-order.ts";

/** The tenant's order `number`'s id, or a 404. */
const orderId = async (number: string) => (await orderByNumber(number)).id;

/**
 * The checklists of the tenant's order `number`, one per unit that has one, in the units' order,
 * and when they were read (`readAt()`, for its card).
 */
export const getOrderChecklists = query(v.string(), async (number) => {
	const id = await orderId(number);
	const readTime = readAt();
	return {
		readAt: readTime,
		checklists: await withPointArticles(await checklistRecords(eq(checklist.orderId, id))),
	};
});

/**
 * The tenant's order `number` as its work order (werkbon) prints it: the order, its customer, the
 * sites of its units, its engineer, every checklist and the sign-off with both signatures.
 */
export const getWorkOrder = query(v.string(), async (number) => {
	return orNotFound(await loadWorkOrder(eq(order.number, number)), m.orders_not_found({ number }));
});

/**
 * The checklists of the tenant's unit `serialNumber` (or a 404), newest first, and its inspection
 * status today, by its latest completed inspection.
 */
export const getUnitChecklists = query(v.string(), async (serialNumber) => {
	const unit = await unitBySerial(serialNumber);
	return unitInspection(unit.id);
});
