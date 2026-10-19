/**
 * The locations at the tenant's customers' sites (`equipmentLocation`): adding, renaming and
 * deleting them, from the customer's sites card and the equipment form, each in a transaction that
 * also logs it (`recordActivity`) against the site's customer too (`parent`), so it shows on the
 * customer's activity card. Names are unique at a site, whatever their case; a location with units
 * can't be deleted.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, count, eq, ne, sql } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { recordActivity, type ActivityRecord } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";

import type { LocationInput } from "../locations/location-schema.ts";
import { newQrToken } from "./qr.ts";

/** Refuses a form with a message on its name field (e.g. `issue.name` of a remote form). */
type NameIssue = (message: string) => Parameters<typeof invalid>[number];

/** A site's customer, as the activity log and the pages know it. */
interface Owner {
	id: number;
	code: string;
}

/** A location as the activity log knows it: by its name, with its site's customer as its parent. */
const subjects = (
	location: { id: number; name: string },
	owner: Owner,
): Pick<ActivityRecord, "subject" | "parent"> => ({
	subject: { type: "location", id: location.id, label: location.name },
	parent: customerSubject(owner),
});

/** The tenant's site `id` with its customer, or a 404. */
async function findSite(tx: Transaction, id: number) {
	const [found] = await tx
		.select({ id: customerSite.id, owner: { id: customer.id, code: customer.code } })
		.from(customerSite)
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(idInTenant(customerSite, id));
	if (!found) error(404, m.customers_site_not_found());
	return found;
}

/** The tenant's location `id`, with its site's customer, or a 404. */
async function findLocation(tx: Transaction, id: number) {
	const [found] = await tx
		.select({ location: equipmentLocation, owner: { id: customer.id, code: customer.code } })
		.from(equipmentLocation)
		.innerJoin(...tenantJoin(customerSite, equipmentLocation.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(idInTenant(equipmentLocation, id));
	if (!found) error(404, m.equipment_location_not_found());
	return found;
}

/**
 * The location at site `siteId` named `name`, in any case (but `except`), if there is one. Compared
 * with SQLite's `lower()`, as the unique index compares them: it lowers ASCII letters only.
 */
async function locationNamed(tx: Transaction, siteId: number, name: string, except?: number) {
	const [found] = await tx
		.select({ id: equipmentLocation.id, name: equipmentLocation.name })
		.from(equipmentLocation)
		.where(
			and(
				inTenant(equipmentLocation),
				eq(equipmentLocation.siteId, siteId),
				eq(sql`lower(${equipmentLocation.name})`, sql`lower(${name})`),
				except === undefined ? undefined : ne(equipmentLocation.id, except),
			),
		);
	return found;
}

/** Adds a location to site `site`, last of the site's, in `tx`, and logs it; returns its id. */
async function insertLocation(
	tx: Transaction,
	site: Awaited<ReturnType<typeof findSite>>,
	input: LocationInput,
) {
	const { organizationId } = currentTenant();
	const [{ last }] = await tx
		.select({ last: sql<number | null>`max(${equipmentLocation.position})` })
		.from(equipmentLocation)
		.where(and(inTenant(equipmentLocation), eq(equipmentLocation.siteId, site.id)));
	const [created] = await tx
		.insert(equipmentLocation)
		.values({
			...input,
			organizationId,
			siteId: site.id,
			position: (last ?? -1) + 1,
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
export function createLocation(siteId: number, input: LocationInput, issue: NameIssue) {
	return db.transaction(async (tx) => {
		const site = await findSite(tx, siteId);
		const taken = await locationNamed(tx, site.id, input.name);
		if (taken) invalid(issue(m.equipment_location_name_taken({ name: taken.name })));
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
export function updateLocation(id: number, input: LocationInput, issue: NameIssue) {
	return db.transaction(async (tx) => {
		const { location, owner } = await findLocation(tx, id);
		const taken = await locationNamed(tx, location.siteId, input.name, id);
		if (taken) invalid(issue(m.equipment_location_name_taken({ name: taken.name })));
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
		if (units.n) invalid(m.equipment_location_delete_refused({ count: units.n }));
		await tx.delete(equipmentLocation).where(idInTenant(equipmentLocation, id));
		await recordActivity(tx, { action: "deleted", ...subjects(location, owner) });
		return owner.code;
	});
}
