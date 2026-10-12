/**
 * Changing the tenant's maintenance plans, each in a transaction of its own that also logs it
 * (`recordActivity`). A plan is logged against its unit too (`parent`), so it shows on the unit's
 * activity card.
 */
import { error } from "@sveltejs/kit";
import { and, eq, notExists } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { planLabel } from "../activity.ts";
import { advanceDueDate, type PlanOrderType } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/** What the office sets on a plan. */
interface PlanInput {
	orderType: PlanOrderType;
	description: string;
	intervalMonths: number;
	nextDueOn: Temporal.PlainDate;
}

/** A plan as the activity log knows it: the record, and its unit as its parent. */
const subjects = (
	plan: { id: number; description: string },
	unit: { id: number; serialNumber: string },
) => ({
	subject: { type: "maintenancePlan", id: plan.id, label: planLabel({ ...unit, ...plan }) },
	parent: { type: "equipment", id: unit.id, label: unit.serialNumber },
});

/** The tenant's unit with `id`, or a 404. */
async function findUnit(tx: Transaction, id: number) {
	const [unit] = await tx
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(idInTenant(equipment, id));
	if (!unit) error(404, m.maintenance_unknown_equipment());
	return unit;
}

/** The tenant's plan with `id`, with its unit, or a 404. */
async function findPlan(tx: Transaction, id: number) {
	const [found] = await tx
		.select({
			plan: maintenancePlan,
			unit: { id: equipment.id, serialNumber: equipment.serialNumber },
		})
		.from(maintenancePlan)
		.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
		.where(idInTenant(maintenancePlan, id));
	if (!found) error(404, m.maintenance_plan_not_found());
	return found;
}

/** Adds a plan to the tenant's unit `equipmentId`; returns the unit's serial number. */
export function createPlan(equipmentId: number, input: PlanInput) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const unit = await findUnit(tx, equipmentId);
		const values = { ...input, anchorDay: input.nextDueOn.day };
		const [created] = await tx
			.insert(maintenancePlan)
			.values({ ...values, organizationId, equipmentId: unit.id })
			.returning({ id: maintenancePlan.id });
		await recordActivity(tx, {
			action: "created",
			...subjects({ id: created.id, description: input.description }, unit),
		});
		return unit.serialNumber;
	});
}

/**
 * Changes the tenant's plan `id`. Setting its due date sets the day of the month its visits fall
 * on as well. Returns its unit's serial number.
 */
export function updatePlan(id: number, input: PlanInput) {
	return db.transaction(async (tx) => {
		const { plan, unit } = await findPlan(tx, id);
		const values = { ...input, anchorDay: input.nextDueOn.day };
		await tx.update(maintenancePlan).set(values).where(idInTenant(maintenancePlan, id));
		await recordActivity(tx, {
			action: "updated",
			...subjects({ id, description: input.description }, unit),
			before: plan,
			after: values,
			// It follows from the due date.
			ignore: ["anchorDay"],
		});
		return unit.serialNumber;
	});
}

/** Pauses or resumes the tenant's plan `id`; returns its unit's serial number. */
export function setPlanPaused(id: number, paused: boolean) {
	return db.transaction(async (tx) => {
		const { plan, unit } = await findPlan(tx, id);
		await tx.update(maintenancePlan).set({ paused }).where(idInTenant(maintenancePlan, id));
		await recordActivity(tx, {
			action: "updated",
			...subjects(plan, unit),
			before: plan,
			after: { paused },
		});
		return unit.serialNumber;
	});
}

/** Deletes the tenant's plan `id` (the orders it made stay); returns its unit's serial number. */
export function deletePlan(id: number) {
	return db.transaction(async (tx) => {
		const { plan, unit } = await findPlan(tx, id);
		await tx.delete(maintenancePlan).where(idInTenant(maintenancePlan, id));
		await recordActivity(tx, { action: "deleted", ...subjects(plan, unit) });
		return unit.serialNumber;
	});
}

/**
 * Adds a plan to each of the tenant's units in `equipmentIds` that has none yet (a contract's
 * covered units), first due one interval from today, all in one transaction. Ids that aren't the
 * tenant's units are refused with a 404. Returns how many it added.
 */
export function addPlansToUnits(
	equipmentIds: number[],
	input: Omit<PlanInput, "nextDueOn">,
	today = Temporal.Now.plainDateISO(getTimeZone()),
) {
	const { organizationId } = currentTenant();
	const nextDueOn = advanceDueDate(today, input.intervalMonths);
	return db.transaction(async (tx) => {
		const units = await tx
			.select({ id: equipment.id, serialNumber: equipment.serialNumber })
			.from(equipment)
			.where(idsInTenant(equipment, equipmentIds));
		if (units.length !== equipmentIds.length) error(404, m.maintenance_unknown_equipment());
		const without = await tx
			.select({ id: equipment.id, serialNumber: equipment.serialNumber })
			.from(equipment)
			.where(
				and(
					idsInTenant(equipment, equipmentIds),
					notExists(
						tx
							.select({ id: maintenancePlan.id })
							.from(maintenancePlan)
							.where(and(eq(maintenancePlan.equipmentId, equipment.id), inTenant(maintenancePlan))),
					),
				),
			)
			.orderBy(equipment.serialNumber);
		for (const unit of without) {
			const [created] = await tx
				.insert(maintenancePlan)
				.values({
					...input,
					nextDueOn,
					anchorDay: nextDueOn.day,
					organizationId,
					equipmentId: unit.id,
				})
				.returning({ id: maintenancePlan.id });
			await recordActivity(tx, {
				action: "created",
				...subjects({ id: created.id, description: input.description }, unit),
			});
		}
		return without.length;
	});
}
