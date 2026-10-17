/**
 * The checklists on orders as the office reads them: an order's (its page's card), the work order
 * to print with its signatures, and a unit's history and inspection status (its page). Every office
 * member reads them; only engineers change them, in the portal (`portal/field-checklists.remote.ts`).
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	order,
	orderSignoff,
	orderUnit,
} from "#lib/server/db/schema.ts";

import { inspectionStatus, rejections } from "./model.ts";
import { query } from "./remote-functions.ts";
import { checklistRecords } from "./server/records.ts";
import { checklist } from "./server/schema.ts";

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
	checklists: await checklistRecords(eq(checklist.orderId, await orderId(number))),
}));

/**
 * The tenant's order `number` as its work order (werkbon) prints it: the order, its customer, the
 * sites of its units, its engineer, every checklist and the sign-off with both signatures.
 */
export const getWorkOrder = query(v.string(), async (number) => {
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
		.where(and(eq(order.number, number), inTenant(order)));
	if (!found) error(404, m.checklists_order_not_found({ number }));
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
	const unitList = units.map(({ equipment: unit }) => ({
		...unit,
		location: unit.location?.name ?? null,
	}));
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
		checklists,
		signoff: signoff[0] ?? null,
	};
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
	const records = await checklistRecords(eq(checklist.equipmentId, unit.id));
	const dated = records
		.map((record) => ({
			...record,
			date: record.completedAt ?? record.order.scheduledFor ?? record.createdAt,
		}))
		.toSorted((a, b) => Temporal.Instant.compare(b.date, a.date) || b.id - a.id);
	const latest = dated.find(
		(record) => record.kind === "inspection" && record.status === "completed",
	);
	const today = Temporal.Now.plainDateISO(getTimeZone());
	return {
		status: inspectionStatus(
			latest?.validUntil
				? { validUntil: latest.validUntil, rejected: rejections(latest.results) > 0 }
				: null,
			today,
		),
		validUntil: latest?.validUntil ?? null,
		checklists: dated,
	};
});
