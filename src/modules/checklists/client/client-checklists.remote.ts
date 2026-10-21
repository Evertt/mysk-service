/**
 * The checklists as a customer's contact reads them in the customer portal: an order's completed
 * ones (their results, on the order's page), its work order to print once it's done, and a unit's
 * inspection status and its completed checklists (a draft's answers and remarks are the office's
 * until it's completed).
 * Gated by `forCustomers` (the module's set for customers' contacts) and scoped to their
 * customer and the sites they see (`#lib/server/auth/customer.ts`), so another customer's order or
 * unit is a 404, also by a tampered number or serial.
 */
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { firstName } from "#lib/engineers/index.ts";
import { viewer } from "#lib/server/access/viewer.ts";
import { atSites, currentCustomer, customerOrders, ofCustomer } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import { forCustomers } from "../remote-functions.ts";
import { checklistRecords, withPointArticles } from "../server/records.ts";
import { checklist } from "../server/schema.ts";
import { unitInspection } from "../server/unit-inspection.ts";
import { loadWorkOrder } from "../server/work-order.ts";

/** Checklists that say of the office only that it completed them, not who (`office: true`). */
function officeUnnamed<T extends { office: string | null }>(records: T[]) {
	return records.map(({ office, ...record }) => ({ ...record, office: office !== null }));
}

/**
 * Checklists as a customer sees who completed them: the engineer by their first name only, and of
 * the office only that it was the office, not who.
 */
function forCustomer<T extends { engineer: string | null; office: string | null }>(records: T[]) {
	return officeUnnamed(records).map(({ engineer, ...record }) => ({
		...record,
		engineer: engineer ? firstName(engineer) : null,
	}));
}

/**
 * The completed checklists of the customer's order `number` (or a 404), of its units at the
 * contact's sites, with their points' results (a draft's are the office's until it's completed),
 * and whether its work order can be printed: once it's done.
 */
export const getClientOrderChecklists = forCustomers.query(v.string(), async (number) => {
	const access = await currentCustomer();
	const found = orNotFound(
		await db
			.select({ id: order.id, status: order.status })
			.from(order)
			.where(and(eq(order.number, number), customerOrders(access))),
		m.client_order_not_found({ number }),
	);
	const checklists = await withPointArticles(
		await checklistRecords(
			and(
				eq(checklist.orderId, found.id),
				eq(checklist.status, "completed"),
				atSites(access, equipment.siteId),
			),
		),
	);
	return { status: found.status, checklists: forCustomer(checklists) };
});

/**
 * The customer's order `number` as its work order prints it, once it's done (a 404 before, or for
 * another's), with only its units (and their checklists) at the contact's sites. It names the
 * engineer in full, as the work order they signed does, but of the office only that it completed a
 * checklist, not who.
 */
export const getClientWorkOrder = forCustomers.query(v.string(), async (number) => {
	const found = orNotFound(
		await loadWorkOrder(number, await viewer()),
		m.client_order_not_found({ number }),
	);
	return { ...found, checklists: officeUnnamed(found.checklists) };
});

/**
 * The customer's unit `serialNumber`'s inspection status and its completed checklists, newest
 * first (or a 404).
 */
export const getClientUnitInspection = forCustomers.query(v.string(), async (serialNumber) => {
	const access = await currentCustomer();
	const unit = orNotFound(
		await db
			.select({ id: equipment.id })
			.from(equipment)
			.where(
				and(
					eq(equipment.serialNumber, serialNumber),
					ofCustomer(access, equipment),
					atSites(access, equipment.siteId),
				),
			),
		m.client_unit_not_found({ serial: serialNumber }),
	);
	const inspection = await unitInspection(unit.id);
	const completed = inspection.checklists.filter((each) => each.status === "completed");
	return { ...inspection, checklists: forCustomer(completed) };
});
