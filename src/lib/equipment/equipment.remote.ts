import { error, redirect } from "@sveltejs/kit";
import { and, asc, count, eq } from "drizzle-orm";
import * as v from "valibot";

import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { refuseIfReferenced } from "#lib/server/db/errors.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
	orderUnit,
} from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { equipmentFields, newLocationToken } from "./form/equipment-schema.ts";
import { removeEquipment } from "./server/equipment.ts";
import { locationAt } from "./server/locations.ts";
import { newQrToken } from "./server/qr.ts";

/**
 * One of the tenant's units with its owner, and how many orders it has (which keep it from being
 * moved). Its service history is `getServiceHistory` (`[serial]/service-history.remote.ts`).
 */
export const getEquipment = forMembers.query(v.string(), async (serialNumber) => {
	const unit = await db.query.equipment.findFirst({
		where: and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)),
		with: {
			customer: true,
			site: true,
			category: { columns: { id: true, name: true } },
			location: { columns: { id: true, name: true, description: true } },
		},
	});
	if (!unit) error(404, m.equipment_serial_not_found({ serial: serialNumber }));

	const [{ orderCount }] = await db
		.select({ orderCount: count() })
		.from(orderUnit)
		.where(and(eq(orderUnit.equipmentId, unit.id), inTenant(orderUnit)));
	return { unit, orderCount };
});

/**
 * Everything the equipment form needs to choose from: the tenant's customers, their sites and the
 * sites' locations, and its categories in their order.
 */
export const getEquipmentFormOptions = forMembers.query(async () => {
	const [customers, sites, locations, categories] = await Promise.all([
		db
			.select({ id: customer.id, code: customer.code, name: customer.name })
			.from(customer)
			.where(inTenant(customer))
			.orderBy(asc(customer.name)),
		db
			.select({
				id: customerSite.id,
				customerId: customerSite.customerId,
				name: customerSite.name,
				city: customerSite.city,
			})
			.from(customerSite)
			.where(inTenant(customerSite))
			.orderBy(asc(customerSite.name), asc(customerSite.id)),
		db
			.select({
				id: equipmentLocation.id,
				siteId: equipmentLocation.siteId,
				name: equipmentLocation.name,
			})
			.from(equipmentLocation)
			.where(inTenant(equipmentLocation))
			.orderBy(asc(equipmentLocation.position), asc(equipmentLocation.id)),
		db
			.select({ id: equipmentCategory.id, name: equipmentCategory.name })
			.from(equipmentCategory)
			.where(inTenant(equipmentCategory))
			.orderBy(asc(equipmentCategory.position), asc(equipmentCategory.id)),
	]);
	return { customers, sites, locations, categories };
});

type EquipmentInput = v.InferOutput<v.ObjectSchema<typeof equipmentFields, undefined>>;
type UnitProblem = Problem<
	| "serialNumber"
	| "categoryId"
	| "customerId"
	| "siteId"
	| "locationId"
	| "newLocationName"
	| "warrantyUntil"
>;

/**
 * Checks what the schema can't: a serial number unique within the tenant, a category of the
 * tenant, a customer of the tenant, a site of that customer and a location at that site (or the
 * name of a new one), and not moving a unit with orders. `existing` must already be checked to be
 * in the tenant.
 */
async function checkUnit(
	existing: typeof equipment.$inferSelect | undefined,
	input: EquipmentInput,
): Promise<UnitProblem[]> {
	const problems: UnitProblem[] = [];
	const sameSerial = await db.query.equipment.findFirst({
		columns: { id: true },
		where: and(eq(equipment.serialNumber, input.serialNumber), inTenant(equipment)),
	});
	if (sameSerial && sameSerial.id !== existing?.id) {
		problems.push({ field: "serialNumber", message: m.equipment_serial_taken() });
	}
	const category = await db.query.equipmentCategory.findFirst({
		columns: { id: true },
		where: idInTenant(equipmentCategory, input.categoryId),
	});
	if (!category) {
		problems.push({ field: "categoryId", message: m.equipment_category_unknown() });
	}
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	// One of the customer's sites (which makes it the tenant's too).
	const site = owner
		? await db.query.customerSite.findFirst({
				columns: { id: true },
				where: and(
					idInTenant(customerSite, input.siteId),
					eq(customerSite.customerId, input.customerId),
				),
			})
		: undefined;
	if (owner && !site) {
		problems.push({ field: "siteId", message: m.equipment_site_unknown() });
	}
	if (input.locationId === newLocationToken) {
		if (!input.newLocationName) {
			problems.push({ field: "newLocationName", message: m.equipment_location_name_required() });
		}
	} else if (site && input.locationId !== null) {
		// One of the site's (which makes it the tenant's too).
		const location = await db.query.equipmentLocation.findFirst({
			columns: { id: true },
			where: and(
				idInTenant(equipmentLocation, input.locationId),
				eq(equipmentLocation.siteId, site.id),
			),
		});
		if (!location) {
			problems.push({ field: "locationId", message: m.equipment_location_unknown() });
		}
	}
	if (!owner) {
		problems.push({ field: "customerId", message: m.equipment_customer_unknown() });
	} else if (existing && existing.customerId !== input.customerId) {
		const [{ total }] = await db
			.select({ total: count() })
			.from(orderUnit)
			.where(and(eq(orderUnit.equipmentId, existing.id), inTenant(orderUnit)));
		if (total) {
			problems.push({ field: "customerId", message: m.equipment_move_refused({ count: total }) });
		}
	}
	if (Temporal.PlainDate.compare(input.warrantyUntil, input.installedAt) < 0) {
		problems.push({ field: "warrantyUntil", message: m.equipment_warranty_before_installed() });
	}
	return problems;
}

/**
 * The unit's fields as stored, in `tx`: at the location chosen, or at the one the form adds (or
 * the site's of that name, if it has one already).
 */
async function storedFields(tx: Transaction, input: EquipmentInput) {
	const { locationId, newLocationName, ...fields } = input;
	return {
		...fields,
		locationId:
			locationId === newLocationToken
				? await locationAt(tx, input.siteId, newLocationName!)
				: locationId,
	};
}

export const createEquipment = forMembers.form(v.object(equipmentFields), async (input, issue) => {
	const { organizationId } = currentTenant();
	refuse(issue, await checkUnit(undefined, input));
	await db.transaction(async (tx) => {
		const fields = await storedFields(tx, input);
		const [created] = await tx
			.insert(equipment)
			.values({ ...fields, organizationId, qrToken: newQrToken() })
			.returning({ id: equipment.id });
		const subject = { type: "equipment", id: created.id, label: input.serialNumber };
		await recordActivity(tx, { action: "created", subject });
	});
	if (input.locationId === newLocationToken) void getEquipmentFormOptions().refresh();
	redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
});

export const updateEquipment = forMembers.form(
	v.object({ id: id(), ...equipmentFields }),
	async (data, issue) => {
		const { id, ...input } = data;
		const existing = await db.query.equipment.findFirst({ where: idInTenant(equipment, id) });
		if (!existing) error(404, m.equipment_not_found());
		refuse(issue, await checkUnit(existing, input));
		// Records of optional modules (e.g. a service contract covering it) belong to the unit's
		// current customer too; the database refuses the move while they exist.
		await refuseIfReferenced(
			() =>
				db.transaction(async (tx) => {
					const fields = await storedFields(tx, input);
					await tx.update(equipment).set(fields).where(idInTenant(equipment, id));
					const subject = { type: "equipment", id, label: input.serialNumber };
					await recordActivity(tx, { action: "updated", subject, before: existing, after: fields });
				}),
			issue.customerId(m.equipment_move_refused_records()),
		);
		void getEquipment(input.serialNumber).refresh();
		if (input.locationId === newLocationToken) void getEquipmentFormOptions().refresh();
		redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
	},
);

export const deleteEquipment = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeEquipment(id);
	redirect(303, "/equipment");
});
