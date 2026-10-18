/**
 * An order's work order (werkbon) as it prints: the order, its customer, the sites of its units,
 * its engineer, every checklist and the sign-off with both signatures. The office reads any of the
 * tenant's (`getWorkOrder`); a customer's contact their customer's, with only the units at their
 * sites (`getClientWorkOrder`).
 */
import { and, asc, eq, type SQL } from "drizzle-orm";

import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	engineer,
	order,
	orderSignoff,
	orderUnit,
} from "#lib/server/db/schema.ts";

import { checklistRecords } from "./records.ts";
import { checklist } from "./schema.ts";

/**
 * The work order of the tenant's order that `where` (on `order`) picks, or nothing; with `sees`,
 * only its units (and their checklists) at the sites for which it holds.
 */
export async function loadWorkOrder(where: SQL, sees: (siteId: number) => boolean = () => true) {
	const [found] = await db
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
				city: customer.city,
			},
			engineer: engineer.name,
		})
		.from(order)
		.innerJoin(...tenantJoin(customer, order.customerId))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(where, inTenant(order)));
	if (!found) return undefined;
	const [checklists, units, signoff] = await Promise.all([
		checklistRecords(eq(checklist.orderId, found.id)),
		db.query.orderUnit.findMany({
			columns: {},
			where: and(eq(orderUnit.orderId, found.id), inTenant(orderUnit)),
			orderBy: asc(orderUnit.position),
			with: {
				equipment: {
					columns: {
						id: true,
						name: true,
						manufacturer: true,
						model: true,
						serialNumber: true,
					},
					with: {
						site: {
							columns: { id: true, name: true, address: true, postalCode: true, city: true },
						},
						location: { columns: { name: true } },
					},
				},
			},
		}),
		db
			.select({
				signerName: orderSignoff.signerName,
				signature: orderSignoff.signature,
				engineerName: orderSignoff.engineerName,
				engineerSignature: orderSignoff.engineerSignature,
				signedAt: orderSignoff.signedAt,
			})
			.from(orderSignoff)
			.where(and(eq(orderSignoff.orderId, found.id), inTenant(orderSignoff))),
	]);
	// Each unit with the name of its location at the site, if it has one.
	const unitList = units
		.filter(({ equipment: unit }) => sees(unit.site.id))
		.map(({ equipment: unit }) => ({ ...unit, location: unit.location?.name ?? null }));
	const shown = new Set(unitList.map((unit) => unit.id));
	const sites = [...new Map(unitList.map((unit) => [unit.site.id, unit.site])).values()];
	return {
		/** Whose work order it is: the tenant's. */
		organization: currentTenant().name,
		order: found,
		units: unitList,
		// Where the work was: its units' sites, or the customer's first for an order without units.
		sites: sites.length
			? sites
			: await db
					.select({
						id: customerSite.id,
						name: customerSite.name,
						address: customerSite.address,
						postalCode: customerSite.postalCode,
						city: customerSite.city,
					})
					.from(customerSite)
					.where(and(eq(customerSite.customerId, found.customerId), inTenant(customerSite)))
					.orderBy(asc(customerSite.id))
					.limit(1),
		checklists: checklists.filter((record) => shown.has(record.unit.id)),
		signoff: signoff[0] ?? null,
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
