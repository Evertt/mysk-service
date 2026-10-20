/**
 * Turning a due plan into an order: the order comes from the core's `createOrders()` (which checks,
 * numbers and logs it), and the plan moves on one interval from its previous due date (not from
 * today, so a late visit doesn't shift the rhythm), on its day of the month, remembering the order
 * as its last one. "Create orders" on the due list and the daily run (`automatic.ts`) both do it
 * here, so their orders are made, numbered and logged alike.
 */

import { equipmentSubject } from "#lib/activity/index.ts";
import { createOrders } from "#lib/orders/server/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { planLabel } from "../activity.ts";
import { advanceDueDate, dueForAutomaticOrder } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/** The order a plan made: its number, and the unit and customer it's for. */
export interface PlanOrder {
	number: string;
	description: string;
	unit: { id: number; serialNumber: string; customerId: number };
}

/**
 * Makes the order for the tenant's plan `id` and moves the plan on, in one transaction: a quote of
 * normal priority for the plan's unit and its customer, with the plan's type and description, as a
 * new order from the order form without a date. Refuses a paused plan (`Refused`); a plan that
 * isn't the tenant's is a 404.
 *
 * With `automatic` (the daily run), it first checks again, in the transaction, that the plan is
 * still due for an automatic order before that horizon (`dueForAutomaticOrder()`), and makes
 * nothing (`null`) if it isn't: so two runs at once can't both make it, as transactions take turns.
 */
export function orderPlan(
	id: number,
	automatic?: { horizon: Temporal.PlainDate },
): Promise<PlanOrder | null> {
	const { organizationId } = currentTenant();
	return db.transaction(async (tx) => {
		const found = orNotFound(
			await tx
				.select({
					plan: maintenancePlan,
					unit: {
						id: equipment.id,
						serialNumber: equipment.serialNumber,
						customerId: equipment.customerId,
					},
					lastOrder: order.number,
					lastOrderStatus: order.status,
				})
				.from(maintenancePlan)
				.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
				.leftJoin(...tenantJoin(order, maintenancePlan.lastOrderId))
				.where(idInTenant(maintenancePlan, id)),
			m.maintenance_plan_not_found(),
		);
		const { plan, unit } = found;
		if (automatic && !dueForAutomaticOrder(plan, found.lastOrderStatus, automatic.horizon)) {
			return null;
		}
		const label = planLabel({ serialNumber: unit.serialNumber, description: plan.description });
		if (plan.paused) throw new Refused(m.maintenance_plan_paused({ label }));

		const [created] = await createOrders(tx, [
			{
				customerId: unit.customerId,
				// The plan's unit; plans of the same site still make an order each.
				units: [unit.id],
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
			parent: equipmentSubject(unit),
			before: { nextDueOn: plan.nextDueOn, lastOrder: found.lastOrder },
			after: { nextDueOn, lastOrder: created.number },
		});
		return { number: created.number, description: plan.description, unit };
	});
}
