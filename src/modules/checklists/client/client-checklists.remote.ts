/**
 * The checklists as a customer's contact reads them in the customer portal: an order's (its
 * results, on the order's page), its work order to print, and a unit's inspection status and
 * history. Gated by `forCustomers` (the module's set for customers' contacts) and scoped to their
 * customer and the sites they see (`#lib/server/auth/customer.ts`), so another customer's order or
 * unit is a 404, also by a tampered number or serial.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import {
	atSites,
	currentCustomer,
	customerOrders,
	ofCustomer,
	seesSite,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";

import { forCustomers } from "../remote-functions.ts";
import { checklistRecords, withPointArticles } from "../server/records.ts";
import { checklist } from "../server/schema.ts";
import { unitInspection } from "../server/unit-inspection.ts";
import { loadWorkOrder } from "../server/work-order.ts";

/**
 * The checklists of the customer's order `number` (or a 404), of its units at the contact's sites,
 * with their points' results, and whether its work order can be printed: once it's done.
 */
export const getClientOrderChecklists = forCustomers.query(v.string(), async (number) => {
	const access = await currentCustomer();
	const [found] = await db
		.select({ id: order.id, status: order.status })
		.from(order)
		.where(and(eq(order.number, number), customerOrders(access)));
	if (!found) error(404, m.checklists_order_not_found({ number }));
	const checklists = await withPointArticles(
		await checklistRecords(and(eq(checklist.orderId, found.id), atSites(access, equipment.siteId))),
	);
	return { status: found.status, checklists };
});

/**
 * The customer's order `number` as its work order prints it (or a 404), with only its units (and
 * their checklists) at the contact's sites.
 */
export const getClientWorkOrder = forCustomers.query(v.string(), async (number) => {
	const access = await currentCustomer();
	const found = await loadWorkOrder(
		and(eq(order.number, number), customerOrders(access))!,
		(siteId) => seesSite(access, siteId),
	);
	if (!found) error(404, m.checklists_order_not_found({ number }));
	return found;
});

/** The customer's unit `serialNumber`'s inspection status and checklists (or a 404). */
export const getClientUnitInspection = forCustomers.query(v.string(), async (serialNumber) => {
	const access = await currentCustomer();
	const [unit] = await db
		.select({ id: equipment.id })
		.from(equipment)
		.where(
			and(
				eq(equipment.serialNumber, serialNumber),
				ofCustomer(access, equipment),
				atSites(access, equipment.siteId),
			),
		);
	if (!unit) error(404, m.checklists_equipment_not_found({ serial: serialNumber }));
	return unitInspection(unit.id);
});
