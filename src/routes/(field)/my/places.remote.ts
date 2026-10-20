/**
 * What an engineer sees of a unit or location whose QR code they scanned (`/q/<token>`): its
 * details, where it is, and their own open orders on it (on any of the location's units). Gated
 * by `forEngineers` and scoped to the tenant, so another tenant's is a 404; other engineers'
 * orders aren't in it.
 */
import { and, asc, eq, type SQL } from "drizzle-orm";
import * as v from "valibot";

import { openOrderStatuses } from "#lib/models.ts";
import { onAnyUnit } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { engineerOrders, inTenant, tenantJoin, idInTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
} from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";
import { forEngineers } from "#lib/server/remote-functions.ts";

/** A unit as the portal shows it: what it is, and where at its site. */
const unitColumns = {
	id: equipment.id,
	serialNumber: equipment.serialNumber,
	name: equipment.name,
	manufacturer: equipment.manufacturer,
	model: equipment.model,
	status: equipment.status,
	category: equipmentCategory.name,
	siteId: equipment.siteId,
	location: equipmentLocation.name,
};

/** The tenant's units for which `where` holds, with their category and location. */
const unitsWhere = (where: SQL | undefined) =>
	db
		.select(unitColumns)
		.from(equipment)
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.where(and(inTenant(equipment), where))
		.orderBy(asc(equipment.name), asc(equipment.manufacturer), asc(equipment.serialNumber));

/** A site as the portal shows it: its address and what to know before going in. */
const siteOf = (siteId: number) =>
	db
		.select({
			name: customerSite.name,
			address: customerSite.address,
			postalCode: customerSite.postalCode,
			city: customerSite.city,
			accessNotes: customerSite.accessNotes,
			customer: customer.name,
		})
		.from(customerSite)
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(idInTenant(customerSite, siteId))
		.then(([site]) => site);

/** The signed-in engineer's open orders on any of the units `ids`, the next first. */
async function myOpenOrders(ids: number[]) {
	if (!ids.length) return [];
	return db
		.select({
			id: order.id,
			number: order.number,
			status: order.status,
			priority: order.priority,
			description: order.description,
			scheduledFor: order.scheduledFor,
			customer: { name: customer.name, city: customer.city },
		})
		.from(order)
		.innerJoin(...tenantJoin(customer, order.customerId))
		.where(and(await engineerOrders(), inList(order.status, openOrderStatuses), onAnyUnit(ids)))
		.orderBy(asc(order.scheduledFor), asc(order.id));
}

/** One of the tenant's units by its serial number, its site, and the engineer's open orders on it. */
export const getMyUnit = forEngineers.query(v.string(), async (serialNumber) => {
	const unit = orNotFound(
		await unitsWhere(eq(equipment.serialNumber, serialNumber)),
		m.equipment_serial_not_found({ serial: serialNumber }),
	);
	const [site, orders] = await Promise.all([siteOf(unit.siteId), myOpenOrders([unit.id])]);
	return { unit, site, orders };
});

/** One of the tenant's locations, its site and units, and the engineer's open orders on them. */
export const getMyLocation = forEngineers.query(id(), async (locationId) => {
	const location = orNotFound(
		await db
			.select({
				id: equipmentLocation.id,
				name: equipmentLocation.name,
				description: equipmentLocation.description,
				siteId: equipmentLocation.siteId,
			})
			.from(equipmentLocation)
			.where(idInTenant(equipmentLocation, locationId)),
		m.equipment_location_not_found(),
	);
	const units = await unitsWhere(eq(equipment.locationId, location.id));
	const [site, orders] = await Promise.all([
		siteOf(location.siteId),
		myOpenOrders(units.map((unit) => unit.id)),
	]);
	return { location, site, units, orders };
});
