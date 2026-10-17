/**
 * What the checklists module tells the condition module (`condition.signals`, `condition.history`,
 * in its `api/extensions.ts`): a unit's inspection status, for its condition status, and the
 * completed checklists in a customer's service history.
 */
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { unitTitle } from "#lib/equipment/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import type {
	ChecklistEntry,
	HistoryQuery,
	UnitSignals,
} from "#modules/condition/api/extensions.ts";

import { inspectionSql } from "./inspection-sql.ts";
import { checklist, checklistResult } from "./schema.ts";

/** `condition.signals`: the unit's inspection status. */
export const inspectionSignal = (): UnitSignals => ({ inspection: inspectionSql().bucket });

/** `condition.history`: the completed checklists of the customer's units (or all), newest first. */
export async function checklistHistory({
	customerId,
	limit,
}: HistoryQuery): Promise<ChecklistEntry[]> {
	const rejections = sql<number>`(select count(*) from ${checklistResult} where ${and(
		eq(checklistResult.checklistId, checklist.id),
		eq(checklistResult.result, "nok"),
	)})`.mapWith(Number);
	const found = await db
		.select({
			id: checklist.id,
			checklistKind: checklist.kind,
			remarks: checklist.remarks,
			completedAt: checklist.completedAt,
			by: engineer.name,
			order: order.number,
			rejections,
			unit: {
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			},
			customer: { code: customer.code, name: customer.name },
		})
		.from(checklist)
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.leftJoin(...tenantJoin(engineer, checklist.completedBy))
		.where(
			and(
				inTenant(checklist),
				eq(checklist.status, "completed"),
				isNotNull(checklist.completedAt),
				customerId === null ? undefined : eq(equipment.customerId, customerId),
			),
		)
		.orderBy(desc(checklist.completedAt), desc(checklist.id))
		.limit(limit);
	return found.map(({ id, completedAt, unit, ...row }) => ({
		...row,
		key: `checklist:${id}`,
		at: completedAt!,
		unit: { serialNumber: unit.serialNumber, title: unitTitle(unit) },
	}));
}
