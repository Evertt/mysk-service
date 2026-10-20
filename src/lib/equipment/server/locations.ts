/**
 * The locations at the tenant's customers' sites (`equipmentLocation`): adding, renaming and
 * deleting them, from the customer's sites card and the equipment form, each in a transaction that
 * also logs it (`recordActivity`) against the site's customer too (`parent`), so it shows on the
 * customer's activity card. Names are unique at a site, whatever their case; a location with units
 * can't be deleted.
 */
import { and, count, eq } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { recordActivity, type LoggedSubjects } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { deleteAndLog, nameTaken, nextPosition, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import type { LocationInput } from "../locations/location-schema.ts";
import { newQrToken } from "./qr.ts";

/** A site's customer, as the activity log and the pages know it. */
interface Owner {
	id: number;
	code: string;
}

/** A location as the activity log knows it: by its name, with its site's customer as its parent. */
const subjects = (location: { id: number; name: string }, owner: Owner): LoggedSubjects => ({
	subject: { type: "location", id: location.id, label: location.name },
	parent: customerSubject(owner),
});

/** The tenant's site `id` with its customer, or a 404. */
async function findSite(tx: Transaction, id: number) {
	return orNotFound(
		await tx
			.select({ id: customerSite.id, owner: { id: customer.id, code: customer.code } })
			.from(customerSite)
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(idInTenant(customerSite, id)),
		m.customers_site_not_found(),
	);
}

/** The tenant's location `id`, with its site's customer, or a 404. */
async function findLocation(tx: Transaction, id: number) {
	return orNotFound(
		await tx
			.select({ location: equipmentLocation, owner: { id: customer.id, code: customer.code } })
			.from(equipmentLocation)
			.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(idInTenant(equipmentLocation, id)),
		m.equipment_location_not_found(),
	);
}

/** The location at site `siteId` named `name`, in any case (but `except`), if there is one. */
const locationNamed = (tx: Transaction, siteId: number, name: string, except?: number) =>
	nameTaken(tx, equipmentLocation, name, { scope: eq(equipmentLocation.siteId, siteId), except });

/**
 * Refuses `name`, on the form's name, if the site `siteId` has a location (but `except`) named so.
 */
async function refuseTakenName(tx: Transaction, siteId: number, name: string, except?: number) {
	const taken = await locationNamed(tx, siteId, name, except);
	if (taken) {
		throw new Refused({
			path: ["name"],
			message: m.equipment_location_name_taken({ name: taken.name }),
		});
	}
}

/** Adds a location to site `site`, last of the site's, in `tx`, and logs it; returns its id. */
async function insertLocation(
	tx: Transaction,
	site: Awaited<ReturnType<typeof findSite>>,
	input: LocationInput,
) {
	const { organizationId } = currentTenant();
	const position = await nextPosition(tx, equipmentLocation, eq(equipmentLocation.siteId, site.id));
	const [created] = await tx
		.insert(equipmentLocation)
		.values({
			...input,
			organizationId,
			siteId: site.id,
			position,
			qrToken: newQrToken(),
		})
		.returning({ id: equipmentLocation.id });
	await recordActivity(tx, {
		action: "created",
		...subjects({ id: created.id, name: input.name }, site.owner),
	});
	return created.id;
}

/**
 * Adds a location to the tenant's site `siteId`; refuses a name the site has already. Returns its
 * id and its site's customer's code.
 */
export function createLocation(siteId: number, input: LocationInput) {
	return db.transaction(async (tx) => {
		const site = await findSite(tx, siteId);
		await refuseTakenName(tx, site.id, input.name);
		const id = await insertLocation(tx, site, input);
		return { id, customerCode: site.owner.code };
	});
}

/**
 * The location at the tenant's site `siteId` called `name` (in any case), made if the site has
 * none yet, in `tx`: the equipment form's "new location". Returns its id.
 */
export async function locationAt(tx: Transaction, siteId: number, name: string) {
	const site = await findSite(tx, siteId);
	const found = await locationNamed(tx, site.id, name);
	return found?.id ?? (await insertLocation(tx, site, { name, description: null }));
}

/** Renames the tenant's location `id`, or describes it; returns its site's customer's code. */
export function updateLocation(id: number, input: LocationInput) {
	return db.transaction(async (tx) => {
		const { location, owner } = await findLocation(tx, id);
		await refuseTakenName(tx, location.siteId, input.name, id);
		await tx.update(equipmentLocation).set(input).where(idInTenant(equipmentLocation, id));
		await recordActivity(tx, {
			action: "updated",
			...subjects({ id, name: input.name }, owner),
			before: location,
			after: input,
		});
		return owner.code;
	});
}

/** Deletes the tenant's location `id`; refuses one with units. Returns its site's customer's code. */
export function removeLocation(id: number) {
	return db.transaction(async (tx) => {
		const { location, owner } = await findLocation(tx, id);
		const [units] = await tx
			.select({ n: count() })
			.from(equipment)
			.where(and(eq(equipment.locationId, id), inTenant(equipment)));
		if (units.n) throw new Refused(m.equipment_location_delete_refused({ count: units.n }));
		await deleteAndLog(equipmentLocation, { tx, ...subjects(location, owner) });
		return owner.code;
	});
}
