/**
 * A unit's maintenance plans and their changes, for the card on a unit's page, and the plans of a
 * contract's covered units, for the card on a contract's page (contracts pass the unit ids in the
 * slot's props; they're checked to be the tenant's here).
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { id, recordId } from "#lib/schema.ts";
import { idsInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";

import { coveredPlansSchema, newPlanSchema, planSchema } from "./form/plan-schema.ts";
import { command, form, query } from "./remote-functions.ts";
import {
	addPlansToUnits,
	createPlan as create,
	deletePlan as remove,
	setPlanPaused,
	updatePlan as update,
} from "./server/plans.ts";
import { maintenancePlan } from "./server/schema.ts";

/** The fields of a plan the cards show, with its last order's number. */
const planColumns = {
	id: maintenancePlan.id,
	equipmentId: maintenancePlan.equipmentId,
	orderType: maintenancePlan.orderType,
	description: maintenancePlan.description,
	intervalMonths: maintenancePlan.intervalMonths,
	nextDueOn: maintenancePlan.nextDueOn,
	paused: maintenancePlan.paused,
	lastOrder: order.number,
};

/** The plans of the tenant's units with `ids`, the next due first. */
const plansOf = (ids: number[]) =>
	db
		.select(planColumns)
		.from(maintenancePlan)
		.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
		.leftJoin(...tenantJoin(order, maintenancePlan.lastOrderId))
		.where(and(idsInTenant(equipment, ids), inTenant(maintenancePlan)))
		.orderBy(asc(maintenancePlan.nextDueOn), asc(maintenancePlan.id));

/** A unit (by serial number) and its plans, the next due first. */
export const getUnitPlans = query(v.string(), async (serialNumber) => {
	const [unit] = await db
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.maintenance_equipment_not_found({ serial: serialNumber }));
	return { unit, plans: await plansOf([unit.id]) };
});

/**
 * The tenant's units among `ids` (a contract's covered units) with their plans, by serial number,
 * and how many have none.
 */
export const getCoveredPlans = query(v.pipe(v.array(recordId()), v.maxLength(500)), async (ids) => {
	if (!ids.length) return { units: [], without: 0 };
	const units = await db
		.select({
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(equipment)
		.where(idsInTenant(equipment, ids))
		.orderBy(asc(equipment.serialNumber));
	const plans = Map.groupBy(await plansOf(ids), (plan) => plan.equipmentId);
	const withPlans = units.map((unit) => ({ ...unit, plans: plans.get(unit.id) ?? [] }));
	return {
		units: withPlans.filter((unit) => unit.plans.length),
		without: withPlans.filter((unit) => !unit.plans.length).length,
	};
});

export const createPlan = form(newPlanSchema, async ({ equipmentId, ...input }) => {
	const serialNumber = await create(equipmentId, input);
	void getUnitPlans(serialNumber).refresh();
});

export const updatePlan = form(planSchema, async ({ id, ...input }) => {
	const serialNumber = await update(id, input);
	void getUnitPlans(serialNumber).refresh();
});

export const pausePlan = command(
	v.object({ id: recordId(), paused: v.boolean() }),
	async ({ id, paused }) => {
		const serialNumber = await setPlanPaused(id, paused);
		void getUnitPlans(serialNumber).refresh();
	},
);

export const deletePlan = form(v.object({ id: id() }), async ({ id }) => {
	const serialNumber = await remove(id);
	void getUnitPlans(serialNumber).refresh();
});

/** A plan for each of a contract's covered units without one; answers how many it added. */
export const addCoveredPlans = form(coveredPlansSchema, async ({ equipmentIds, ...input }) => {
	const added = await addPlansToUnits(equipmentIds, input);
	void getCoveredPlans(equipmentIds).refresh();
	return { added };
});
