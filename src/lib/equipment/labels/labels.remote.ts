import { error } from "@sveltejs/kit";
import { and, asc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

/**
 * The QR labels of one of the tenant's sites, to print on a sheet: its locations' and its units'
 * (each with its name, serial number and location), in the locations' order. Only one location's
 * (with its units') with `location`, or one unit's with `unit` (a serial number); with both, the
 * unit's, a 404 when it isn't at that location.
 */
export const getLabelSheet = forMembers.query(
	v.object({
		site: id(),
		location: v.optional(id()),
		unit: v.optional(v.pipe(v.string(), v.maxLength(40))),
	}),
	async ({ site: siteId, location: locationId, unit: serialNumber }) => {
		const [site] = await db
			.select({
				id: customerSite.id,
				name: customerSite.name,
				city: customerSite.city,
				customer: { code: customer.code, name: customer.name },
			})
			.from(customerSite)
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(and(eq(customerSite.id, siteId), inTenant(customerSite)));
		if (!site) error(404, m.customers_site_not_found());

		const locations = serialNumber
			? []
			: await db
					.select({
						id: equipmentLocation.id,
						name: equipmentLocation.name,
						qrToken: equipmentLocation.qrToken,
					})
					.from(equipmentLocation)
					.where(
						and(
							inTenant(equipmentLocation),
							eq(equipmentLocation.siteId, site.id),
							locationId === undefined ? undefined : eq(equipmentLocation.id, locationId),
						),
					)
					.orderBy(asc(equipmentLocation.position), asc(equipmentLocation.id));
		const units = await db
			.select({
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
				qrToken: equipment.qrToken,
				location: { id: equipmentLocation.id, name: equipmentLocation.name },
			})
			.from(equipment)
			.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
			.where(
				and(
					inTenant(equipment),
					eq(equipment.siteId, site.id),
					locationId === undefined ? undefined : eq(equipment.locationId, locationId),
					serialNumber === undefined ? undefined : eq(equipment.serialNumber, serialNumber),
				),
			)
			// By location, in the site's order (those without one last), then as the customer names
			// them, else by make, as the location's page does.
			.orderBy(
				asc(sql`${equipmentLocation.position} is null`),
				asc(equipmentLocation.position),
				asc(sql`coalesce(${equipment.name}, ${equipment.manufacturer}) collate nocase`),
				asc(equipment.model),
				asc(equipment.serialNumber),
			);
		// One unit's (only when it's at `location`, if that's given too), or one location's.
		const missing = serialNumber ? !units.length : locationId !== undefined && !locations.length;
		if (missing) error(404, m.equipment_labels_not_found());
		return { site, locations, units };
	},
);
