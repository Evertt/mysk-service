import { form, query } from "$app/server";
import { error, redirect } from "@sveltejs/kit";
import { and, asc, count, eq } from "drizzle-orm";
import * as v from "valibot";

import { removeEquipment } from "#lib/equipment/server/equipment.ts";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity.ts";
import { refuseIfReferenced } from "#lib/server/db/errors.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { idInTenant, inTenant, requireMember } from "#lib/server/session.ts";

import { equipmentFields } from "./equipment-schema.ts";

/**
 * One of the tenant's units with its owner, and how many orders it has (which keep it from being
 * moved). Its service history is `getServiceHistory` (`[serial]/service-history.remote.ts`).
 */
export const getEquipment = query(v.string(), async (serialNumber) => {
	requireMember();
	const unit = await db.query.equipment.findFirst({
		where: and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)),
		with: { customer: true },
	});
	if (!unit) error(404, m.equipment_serial_not_found({ serial: serialNumber }));

	const [{ orderCount }] = await db
		.select({ orderCount: count() })
		.from(order)
		.where(and(eq(order.equipmentId, unit.id), inTenant(order)));
	return { unit, orderCount };
});

/** Everything the equipment form needs to choose from (the tenant's customers). */
export const getEquipmentFormOptions = query(async () => {
	requireMember();
	const customers = await db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.where(inTenant(customer))
		.orderBy(asc(customer.name));
	return { customers };
});

type EquipmentInput = v.InferOutput<v.ObjectSchema<typeof equipmentFields, undefined>>;
type UnitProblem = Problem<"serialNumber" | "customerId" | "warrantyUntil">;

/**
 * Checks what the schema can't: a serial number unique within the tenant, a customer of the
 * tenant, and not moving a unit with orders. `existing` must already be checked to be in the tenant.
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
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: idInTenant(customer, input.customerId),
	});
	if (!owner) {
		problems.push({ field: "customerId", message: m.equipment_customer_unknown() });
	} else if (existing && existing.customerId !== input.customerId) {
		const [{ total }] = await db
			.select({ total: count() })
			.from(order)
			.where(and(eq(order.equipmentId, existing.id), inTenant(order)));
		if (total) {
			problems.push({ field: "customerId", message: m.equipment_move_refused({ count: total }) });
		}
	}
	if (input.warrantyUntil < input.installedAt) {
		problems.push({ field: "warrantyUntil", message: m.equipment_warranty_before_installed() });
	}
	return problems;
}

export const createEquipment = form(v.object(equipmentFields), async (input, issue) => {
	const { organizationId } = requireMember();
	refuse(issue, await checkUnit(undefined, input));
	await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(equipment)
			.values({ ...input, organizationId })
			.returning({ id: equipment.id });
		const subject = { type: "equipment", id: created.id, label: input.serialNumber };
		await recordActivity(tx, { action: "created", subject });
	});
	redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
});

export const updateEquipment = form(
	v.object({ id: id(), ...equipmentFields }),
	async (data, issue) => {
		requireMember();
		const { id, ...input } = data;
		const existing = await db.query.equipment.findFirst({ where: idInTenant(equipment, id) });
		if (!existing) error(404, m.equipment_not_found());
		refuse(issue, await checkUnit(existing, input));
		// Records of optional modules (e.g. a service contract covering it) belong to the unit's
		// current customer too; the database refuses the move while they exist.
		await refuseIfReferenced(
			() =>
				db.transaction(async (tx) => {
					await tx.update(equipment).set(input).where(idInTenant(equipment, id));
					const subject = { type: "equipment", id, label: input.serialNumber };
					await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
				}),
			issue.customerId(m.equipment_move_refused_records()),
		);
		void getEquipment(input.serialNumber).refresh();
		redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
	},
);

export const deleteEquipment = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeEquipment(id);
	redirect(303, "/equipment");
});
