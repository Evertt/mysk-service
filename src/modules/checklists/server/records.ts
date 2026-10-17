/**
 * The tenant's checklists as the pages show them: with their unit, order, the engineer who
 * completed them and their points in order (`results`). The office's order card, the work order to
 * print, a unit's history and the engineer portal all read them through `checklistRecords()`.
 */
import { and, asc, eq, type SQL, sql } from "drizzle-orm";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	engineer,
	equipment,
	equipmentLocation,
	order,
	orderUnit,
	user,
} from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

import { pointArticles } from "../api/extensions.ts";
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
			/** The office member who completed it on the engineer's behalf (no engineer then). */
			office: sql<string | null>`case when ${checklist.completedBy} is null then ${user.name} end`,
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
				/** The name of its location at the site, if it has one. */
				location: equipmentLocation.name,
			},
			position: orderUnit.position,
		})
		.from(checklist)
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.innerJoin(
			orderUnit,
			and(
				eq(orderUnit.organizationId, checklist.organizationId),
				eq(orderUnit.orderId, checklist.orderId),
				eq(orderUnit.equipmentId, checklist.equipmentId),
			),
		)
		.leftJoin(...tenantJoin(engineer, checklist.completedBy))
		.leftJoin(user, eq(user.id, checklist.completedByUser))
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
			/** The template point it was copied from: what the modules link to a point by. */
			templateItemId: checklistResult.templateItemId,
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

/**
 * The checklists with the article each rejected point checks on its unit, if a module knows one
 * (`checklists.pointArticles`, e.g. the condition module's components), as `materialId`: what the
 * parts shop suggests first. None for the other points.
 */
export async function withPointArticles(records: Awaited<ReturnType<typeof checklistRecords>>) {
	const points = records.flatMap((record) =>
		record.results.flatMap((result) =>
			result.result === "nok" && result.templateItemId !== null
				? [{ equipmentId: record.unit.id, templateItemId: result.templateItemId }]
				: [],
		),
	);
	const known = points.length ? (await collect(pointArticles, { points })).flat() : [];
	const articleOf = (equipmentId: number, templateItemId: number | null) =>
		known.find((each) => each.equipmentId === equipmentId && each.templateItemId === templateItemId)
			?.materialId ?? null;
	return records.map((record) => ({
		...record,
		results: record.results.map((result) => ({
			...result,
			materialId: result.result === "nok" ? articleOf(record.unit.id, result.templateItemId) : null,
		})),
	}));
}
