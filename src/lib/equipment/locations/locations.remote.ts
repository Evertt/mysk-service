/**
 * The locations at the tenant's customers' sites: a customer's (on their sites card), one with its
 * units and their orders (its page), and adding, renaming and deleting them (see
 * `server/locations.ts`). The changes refresh the customer's locations.
 */
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	engineer,
	equipment,
	equipmentLocation,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { createLocation, removeLocation, updateLocation } from "../server/locations.ts";
import { officeUnits, readLocation } from "../server/units.ts";
import { locationSchema, newLocationSchema } from "./location-schema.ts";

/** How many of a location's units' orders its page shows, newest first. */
const HISTORY_LIMIT = 50;

/**
 * The locations at the sites of the tenant's customer `code`, by site and in their order, each
 * with how many units are there.
 */
export const getCustomerLocations = forMembers.query(v.string(), async (code) => {
	const units = db
		.select({ locationId: equipment.locationId, n: count().as("n") })
		.from(equipment)
		.where(inTenant(equipment))
		.groupBy(equipment.locationId)
		.as("units");
	return db
		.select({
			id: equipmentLocation.id,
			siteId: equipmentLocation.siteId,
			name: equipmentLocation.name,
			description: equipmentLocation.description,
			unitCount: sql<number>`coalesce(${units.n}, 0)`,
		})
		.from(equipmentLocation)
		.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.leftJoin(units, eq(units.locationId, equipmentLocation.id))
		.where(and(inTenant(equipmentLocation), eq(customer.code, code)))
		.orderBy(
			asc(equipmentLocation.siteId),
			asc(equipmentLocation.position),
			asc(equipmentLocation.id),
		);
});

/**
 * One of the tenant's locations with its site and customer, the units there, and the latest of
 * their orders.
 */
export const getLocation = forMembers.query(id(), async (locationId) => {
	const { location, units } = orNotFound(
		await readLocation(officeUnits(), locationId),
		m.equipment_location_not_found(),
	);

	// The orders on any of them, with which of them each is about.
	const ordersOn = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			description: order.description,
			scheduledFor: order.scheduledFor,
			completedAt: order.completedAt,
			createdAt: order.createdAt,
			engineer: { id: engineer.id, name: engineer.name },
			units: sql<string>`group_concat(${equipment.serialNumber}, ', ')`,
		})
		.from(orderUnit)
		.innerJoin(...tenantJoin(order, orderUnit.orderId))
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(inTenant(orderUnit), eq(equipment.locationId, location.id)))
		.groupBy(order.id)
		.orderBy(desc(order.createdAt), desc(order.id))
		.limit(HISTORY_LIMIT);

	return {
		location,
		units,
		orders: ordersOn.map((row) => ({ ...row, units: row.units.split(", ") })),
	};
});

export const addLocation = forMembers.form(newLocationSchema, async ({ siteId, ...input }) => {
	const { customerCode } = await createLocation(siteId, input);
	void getCustomerLocations(customerCode).refresh();
});

export const editLocation = forMembers.form(locationSchema, async ({ id, ...input }) => {
	const code = await updateLocation(id, input);
	void getCustomerLocations(code).refresh();
	void getLocation(String(id)).refresh();
});

export const deleteLocation = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	const code = await removeLocation(id);
	void getCustomerLocations(code).refresh();
});
