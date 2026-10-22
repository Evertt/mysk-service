/**
 * An order's work order (werkbon) as it prints: the order, its customer, its engineer, its work
 * record's units at their sites and sign-off with both signatures (`readWorkRecord()`), and every
 * checklist. The office reads any of the tenant's (`getWorkOrder`); a customer's contact their
 * customer's, with only the units at their sites (`getClientWorkOrder`).
 */
import { eq } from "drizzle-orm";

import { printedWorkOrder, readWorkRecord } from "#lib/orders/server/index.ts";
import type { Viewer } from "#lib/server/access/viewer.ts";
import { currentTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, order } from "#lib/server/db/schema.ts";

import { checklistRecords } from "./records.ts";
import { checklist } from "./schema.ts";

/**
 * The work order of the tenant's order `number` as `viewer` may have it (`printedWorkOrder()`: the
 * office's any, a contact's their done orders' with only the units at their sites), or nothing.
 */
export async function loadWorkOrder(number: string, viewer: Viewer) {
	const scope = await printedWorkOrder(number, viewer);
	const [[found], record] = await Promise.all([
		db
			.select({
				id: order.id,
				number: order.number,
				type: order.type,
				status: order.status,
				description: order.description,
				scheduledFor: order.scheduledFor,
				completedAt: order.completedAt,
				laborHours: order.laborHours,
				customerId: order.customerId,
				customer: {
					name: customer.name,
					code: customer.code,
					contactName: customer.contactName,
				},
			})
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(scope.where),
		readWorkRecord(scope),
	]);
	if (!found || !record) return undefined;
	const { units, sites, signoff, engineer } = record;
	const checklists = await checklistRecords(eq(checklist.orderId, found.id));
	const shown = new Set(units.map((unit) => unit.id));
	return {
		/** Whose work order it is: the tenant's. */
		organization: currentTenant().name,
		order: { ...found, engineer },
		units,
		/** Where the work was: its units' sites, or the customer's only one for an order without units. */
		sites,
		checklists: checklists.filter((each) => shown.has(each.unit.id)),
		signoff,
	};
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadWorkOrder>>>;

/**
 * A work order as the page prints it: the office's, or a customer's, whose checklists say of the
 * office only that it completed them (`office: true`).
 */
export type WorkOrder = Omit<Loaded, "checklists"> & {
	checklists: (Omit<Loaded["checklists"][number], "office"> & {
		office: string | boolean | null;
	})[];
};
