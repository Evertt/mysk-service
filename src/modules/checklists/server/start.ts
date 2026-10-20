/**
 * Starting a unit's checklist from the work orders page ("Keuring 2026", "Onderhoud 2026"): an
 * inspection or maintenance order for the unit, ready to plan (a quote, unscheduled, without an
 * engineer), made through the core's `createOrders()`, which numbers and logs it; its checklist
 * comes with its unit, by the rule every inspection and maintenance order follows
 * (`syncChecklists()`). A unit with an open order of that kind already gets that one instead.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";

import { unitTitle } from "#lib/equipment/index.ts";
import { unitBySerial } from "#lib/equipment/server/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { createOrders } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { checklistLabels } from "../labels.ts";
import type { ChecklistKind } from "../model.ts";
import { currentYear } from "./assets.ts";
import { checklist } from "./schema.ts";
import { offeredTemplate } from "./templates.ts";

/** The unit's newest open order of `kind` (of that type), in `tx`, if it has one. */
async function openOrderOf(tx: Transaction, equipmentId: number, kind: ChecklistKind) {
	const [found] = await tx
		.select({ id: order.id, number: order.number })
		.from(orderUnit)
		.innerJoin(...tenantJoin(order, orderUnit.orderId))
		.where(
			and(
				eq(orderUnit.equipmentId, equipmentId),
				inTenant(orderUnit),
				eq(order.type, kind),
				inList(order.status, openOrderStatuses),
			),
		)
		.orderBy(desc(order.id))
		.limit(1);
	return found;
}

/**
 * Starts the tenant's unit `serialNumber`'s checklist of `kind`: its open order of that kind if it
 * has one, else a new order for it. A 404 for a unit that isn't the tenant's; a 400 for one out of
 * service or whose category has no template. Answers the order's number, its checklist of the
 * unit (none if it has none, e.g. an order made before the template) and whether it's new.
 */
export function startChecklist(serialNumber: string, kind: ChecklistKind) {
	return db.transaction(async (tx) => {
		const unit = await unitBySerial(
			serialNumber,
			{
				id: equipment.id,
				customerId: equipment.customerId,
				categoryId: equipment.categoryId,
				status: equipment.status,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			},
			tx,
		);
		const template =
			unit.status === "decommissioned" ? null : await offeredTemplate(tx, unit.categoryId);
		if (!template) error(400, m.checklists_start_no_template({ unit: unitTitle(unit) }));

		let target = await openOrderOf(tx, unit.id, kind);
		const created = !target;
		if (!target) {
			[target] = await createOrders(tx, [
				{
					customerId: unit.customerId,
					units: [unit.id],
					type: kind,
					// Stored, in the language of whoever starts it: "Keuring 2026".
					description: m.checklists_start_description({
						kind: checklistLabels.label("checklistKind", kind),
						year: String(currentYear()),
					}),
				},
			]);
		}
		const [made] = await tx
			.select({ id: checklist.id })
			.from(checklist)
			.where(
				and(
					eq(checklist.orderId, target.id),
					eq(checklist.equipmentId, unit.id),
					inTenant(checklist),
				),
			);
		return { number: target.number, checklistId: made?.id ?? null, created };
	});
}
