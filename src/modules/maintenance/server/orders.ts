/**
 * Turning a due plan into an order: the order comes from the core's `createOrders()` (which checks,
 * numbers and logs it), and the plan moves on one interval from its previous due date (not from
 * today, so a late visit doesn't shift the rhythm), on its day of the month, remembering the order
 * as its last one.
 */
import { error, invalid } from "@sveltejs/kit";

import { createOrders } from "#lib/orders/server/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";

import { planLabel } from "../activity.ts";
import { advanceDueDate } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/**
 * Makes the order for the tenant's plan `id` and moves the plan on, in one transaction: a quote of
 * normal priority for the plan's unit and its customer, with the plan's type and description, as a
 * new order from the order form without a date. Refuses a paused plan (`invalid()`); a plan that
 * isn't the tenant's is a 404. Returns the order's number.
 */
export function orderPlan(id: number) {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const [found] = await tx
			.select({
				plan: maintenancePlan,
				unit: {
					id: equipment.id,
					serialNumber: equipment.serialNumber,
					customerId: equipment.customerId,
				},
				lastOrder: order.number,
			})
			.from(maintenancePlan)
			.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
			.leftJoin(...tenantJoin(order, maintenancePlan.lastOrderId))
			.where(idInTenant(maintenancePlan, id));
		if (!found) error(404, m.maintenance_plan_not_found());
		const { plan, unit } = found;
		const label = planLabel({ serialNumber: unit.serialNumber, description: plan.description });
		if (plan.paused) invalid(m.maintenance_plan_paused({ label }));

		const [created] = await createOrders(tx, [
			{
				customerId: unit.customerId,
				equipmentId: unit.id,
				type: plan.orderType,
				description: plan.description,
			},
		]);
		const nextDueOn = advanceDueDate(plan.nextDueOn, plan.intervalMonths, plan.anchorDay);
		await tx
			.update(maintenancePlan)
			.set({ nextDueOn, lastOrderId: created.id, lastOrderOrganizationId: organizationId })
			.where(idInTenant(maintenancePlan, id));
		await recordActivity(tx, {
			action: "updated",
			subject: { type: "maintenancePlan", id, label },
			parent: { type: "equipment", id: unit.id, label: unit.serialNumber },
			before: { nextDueOn: plan.nextDueOn, lastOrder: found.lastOrder },
			after: { nextDueOn, lastOrder: created.number },
		});
		return created.number;
	});
}
