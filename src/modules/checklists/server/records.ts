/**
 * The tenant's checklists as the pages show them: with their unit, order, the engineer who
 * completed them and their points in order (`results`). The office's order card, the work order to
 * print, a unit's history and the engineer portal all read them through `checklistRecords()`.
 */
import { and, asc, eq, type SQL } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { engineer, equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { checklist, checklistResult } from "./schema.ts";

/** The tenant's checklists that `where` picks (a condition on `checklist` or its order), in their orders' unit order. */
export async function checklistRecords(where: SQL | undefined, tx: Transaction | typeof db = db) {
	const found = await tx
		.select({
			id: checklist.id,
			name: checklist.name,
			norm: checklist.norm,
			validityMonths: checklist.validityMonths,
			kind: checklist.kind,
			status: checklist.status,
			remarks: checklist.remarks,
			completedAt: checklist.completedAt,
			validUntil: checklist.validUntil,
			createdAt: checklist.createdAt,
			engineer: engineer.name,
			order: {
				id: order.id,
				number: order.number,
				status: order.status,
				scheduledFor: order.scheduledFor,
			},
			unit: {
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
				location: equipment.location,
			},
			position: orderUnit.position,
		})
		.from(checklist)
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
		.innerJoin(
			orderUnit,
			and(
				eq(orderUnit.organizationId, checklist.organizationId),
				eq(orderUnit.orderId, checklist.orderId),
				eq(orderUnit.equipmentId, checklist.equipmentId),
			),
		)
		.leftJoin(...tenantJoin(engineer, checklist.completedBy))
		.where(and(inTenant(checklist), where))
		.orderBy(asc(order.id), asc(orderUnit.position));
	if (!found.length) return [];
	const results = await tx
		.select({
			id: checklistResult.id,
			checklistId: checklistResult.checklistId,
			group: checklistResult.group,
			text: checklistResult.text,
			position: checklistResult.position,
			result: checklistResult.result,
			remark: checklistResult.remark,
		})
		.from(checklistResult)
		.where(
			and(
				inList(
					checklistResult.checklistId,
					found.map((row) => row.id),
				),
				inTenant(checklistResult),
			),
		)
		.orderBy(asc(checklistResult.checklistId), asc(checklistResult.position));
	const byChecklist = Map.groupBy(results, (result) => result.checklistId);
	return found.map(({ position: _position, ...row }) => ({
		...row,
		results: (byChecklist.get(row.id) ?? []).map(({ checklistId: _id, ...result }) => result),
	}));
}
