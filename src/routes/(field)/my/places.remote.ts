/**
 * What an engineer sees of a unit or location whose QR code they scanned (`/q/<token>`): its
 * details, where it is (`readUnits()` and `readLocation()` as the engineer sees them), and their
 * own open orders on it (on any of the location's units). Gated by `forEngineers` and scoped to
 * the tenant, so another tenant's is a 404; other engineers' orders aren't in it.
 */
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { engineerUnits, readLocation, readUnits } from "#lib/equipment/server/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { onAnyUnit } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { engineerOrders, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";
import { forEngineers } from "#lib/server/remote-functions.ts";

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

/** One of the tenant's units by its serial number, at its site, and the engineer's open orders on it. */
export const getMyUnit = forEngineers.query(v.string(), async (serialNumber) => {
	const unit = orNotFound(
		await readUnits(engineerUnits(), eq(equipment.serialNumber, serialNumber)),
		m.equipment_serial_not_found({ serial: serialNumber }),
	);
	return { unit, orders: await myOpenOrders([unit.id]) };
});

/** One of the tenant's locations, its site and units, and the engineer's open orders on them. */
export const getMyLocation = forEngineers.query(id(), async (locationId) => {
	const { location, units } = orNotFound(
		await readLocation(engineerUnits(), locationId),
		m.equipment_location_not_found(),
	);
	return { location, units, orders: await myOpenOrders(units.map((unit) => unit.id)) };
});
