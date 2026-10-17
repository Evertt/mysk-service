/**
 * Recording a unit's condition: worked out from its checklist when an engineer completes it in the
 * portal (`checklists.completed`, its score from the points), with the engineer's advice added to
 * it after; or by a member in the office (on the unit's page), as a correction. Each is a new
 * record (the latest is the unit's condition), made and logged in a transaction, against the unit.
 * Another tenant's unit, or another engineer's order, is a 404, also by a tampered id.
 */
import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { fieldActions } from "#lib/orders/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	inTenant,
	isSystemUser,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, equipment, order, orderUnit, user } from "#lib/server/db/schema.ts";
import { type ChecklistCompleting, checklistScore } from "#modules/checklists/api/extensions.ts";

import { conditionLabel } from "../activity.ts";
import type { ConditionSource } from "../model.ts";
import { component, componentCheckpoint, unitCondition } from "./schema.ts";

/** What's recorded: the score and the advice (none when empty). */
export interface ConditionInput {
	score: number;
	advice: string;
}

/** A unit as a condition is recorded for it. */
interface Unit {
	id: number;
	serialNumber: string;
}

/** A component of the unit, whose condition it is. */
interface Part {
	id: number;
	number: string;
}

/**
 * Records the condition of the unit (or of its component `by.component`) in `tx`, and logs it
 * against the unit.
 */
async function insertCondition(
	tx: Transaction,
	unit: Unit,
	input: ConditionInput,
	by: { source: ConditionSource; orderId?: number; engineerId?: number; component?: Part },
) {
	const tenant = currentTenant();
	const advice = input.advice.trim() || null;
	const [made] = await tx
		.insert(unitCondition)
		.values({
			organizationId: tenant.organizationId,
			equipmentId: unit.id,
			componentId: by.component?.id ?? null,
			score: input.score,
			advice,
			source: by.source,
			orderId: by.orderId ?? null,
			orderOrganizationId: by.orderId ? tenant.organizationId : null,
			engineerId: by.engineerId ?? null,
			userId: isSystemUser(tenant.user) ? null : tenant.user.id,
			recordedAt: Temporal.Now.instant(),
		})
		.returning({ id: unitCondition.id });
	await recordActivity(tx, {
		action: "recorded",
		subject: {
			type: "unitCondition",
			id: made.id,
			label: conditionLabel({
				serialNumber: unit.serialNumber,
				component: by.component?.number,
				score: input.score,
			}),
		},
		parent: { type: "equipment", id: unit.id, label: unit.serialNumber },
		// The advice, as it was given.
		note: advice,
	});
	return made.id;
}

/**
 * Records the condition of the tenant's unit `serialNumber`, or of its component `componentId`, by
 * a member in the office. Another tenant's unit, or a component that isn't the unit's, is a 404.
 */
export function recordOfficeCondition(
	serialNumber: string,
	input: ConditionInput,
	componentId: number | null = null,
) {
	return db.transaction(async (tx) => {
		const [unit] = await tx
			.select({ id: equipment.id, serialNumber: equipment.serialNumber })
			.from(equipment)
			.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
		if (!unit) error(404, m.condition_unit_not_found({ serial: serialNumber }));
		let part: Part | undefined;
		if (componentId !== null) {
			[part] = await tx
				.select({ id: component.id, number: component.number })
				.from(component)
				.where(and(idInTenant(component, componentId), eq(component.equipmentId, unit.id)));
			if (!part) error(404, m.condition_component_not_found());
		}
		await insertCondition(tx, unit, input, { source: "office", component: part });
		return unit;
	});
}

/**
 * The tenant's order `number` of the engineer's, with its unit `equipmentId`: a 404 when either
 * isn't theirs (or the unit isn't on the order).
 */
export async function findFieldUnit(
	tx: Transaction | typeof db,
	engineerId: number,
	number: string,
	equipmentId: number,
) {
	const [found] = await tx
		.select({
			order: { id: order.id, number: order.number, status: order.status },
			unit: {
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			},
		})
		.from(order)
		.innerJoin(
			orderUnit,
			and(
				eq(orderUnit.organizationId, order.organizationId),
				eq(orderUnit.orderId, order.id),
				eq(orderUnit.equipmentId, equipmentId),
			),
		)
		.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
		.where(and(eq(order.number, number), inTenant(order), eq(order.engineerId, engineerId)));
	if (!found) error(404, m.condition_order_not_found({ number }));
	return found;
}

/** The unit's components with the template points that check each, in `tx`, in their order. */
async function checkedComponents(tx: Transaction, equipmentId: number) {
	const parts = await tx
		.select({ id: component.id, number: component.number })
		.from(component)
		.where(and(eq(component.equipmentId, equipmentId), inTenant(component)))
		.orderBy(asc(component.position), asc(component.id));
	if (!parts.length) return [];
	const links = await tx
		.select({
			componentId: componentCheckpoint.componentId,
			templateItemId: componentCheckpoint.templateItemId,
		})
		.from(componentCheckpoint)
		.innerJoin(
			component,
			and(
				eq(component.organizationId, componentCheckpoint.organizationId),
				eq(component.id, componentCheckpoint.componentId),
			),
		)
		.where(and(eq(component.equipmentId, equipmentId), inTenant(componentCheckpoint)));
	const byComponent = Map.groupBy(links, (link) => link.componentId);
	return parts.map((part) => ({
		...part,
		items: new Set((byComponent.get(part.id) ?? []).map((link) => link.templateItemId)),
	}));
}

/**
 * `checklists.completed`: records the conditions a completed checklist found, in its transaction,
 * on its order, by the engineer who completed it, without advice (which they add after,
 * `adviseFieldCondition()`): the unit's, its score from all the points (`checklistScore()`), and
 * each of its components' whose points it answered, from those points alone. Nothing for a score
 * none of whose points count (all not applicable).
 */
export async function recordChecklistConditions({ tx, checklist, points }: ChecklistCompleting) {
	const [unit] = await tx
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(idInTenant(equipment, checklist.equipmentId));
	if (!unit) return undefined;
	const by = {
		source: "checklist" as const,
		orderId: checklist.orderId,
		engineerId: checklist.engineerId,
	};
	const score = checklistScore(points);
	if (score !== null) await insertCondition(tx, unit, { score, advice: "" }, by);
	for (const part of await checkedComponents(tx, unit.id)) {
		const own = checklistScore(
			points.filter(
				(point) => point.templateItemId !== null && part.items.has(point.templateItemId),
			),
		);
		if (own !== null) {
			await insertCondition(tx, unit, { score: own, advice: "" }, { ...by, component: part });
		}
	}
	return undefined;
}

/** The condition its checklist gave the unit on the order (the latest), in `tx`, if any. */
export async function checklistCondition(
	tx: Transaction | typeof db,
	equipmentId: number,
	orderId: number,
) {
	const [found] = await tx
		.select({ id: unitCondition.id, score: unitCondition.score, advice: unitCondition.advice })
		.from(unitCondition)
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				eq(unitCondition.orderId, orderId),
				eq(unitCondition.source, "checklist"),
				isNull(unitCondition.componentId),
				inTenant(unitCondition),
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id))
		.limit(1);
	return found;
}

/** The conditions its checklist on the order gave the unit's components, in their order. */
export function checklistComponentConditions(equipmentId: number, orderId: number) {
	return db
		.select({
			id: unitCondition.id,
			number: component.number,
			name: component.name,
			score: unitCondition.score,
		})
		.from(unitCondition)
		.innerJoin(
			component,
			and(
				eq(component.organizationId, unitCondition.organizationId),
				eq(component.id, unitCondition.componentId),
			),
		)
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				eq(unitCondition.orderId, orderId),
				eq(unitCondition.source, "checklist"),
				inTenant(unitCondition),
			),
		)
		.orderBy(asc(component.position), asc(component.id), desc(unitCondition.id));
}

/**
 * Gives the condition the checklist of a unit on one of the engineer's orders gave it (see
 * `recordChecklistConditions()`) the engineer's advice (none when empty), while the order is in
 * progress. Logged as a change of that condition. A 400 when the checklist gave it no score.
 */
export function adviseFieldCondition(
	engineerId: number,
	number: string,
	equipmentId: number,
	advice: string,
) {
	return db.transaction(async (tx) => {
		const found = await findFieldUnit(tx, engineerId, number, equipmentId);
		if (!fieldActions(found.order.status).work) {
			error(400, m.condition_not_in_progress({ number }));
		}
		const recorded = await checklistCondition(tx, found.unit.id, found.order.id);
		if (!recorded) error(400, m.condition_portal_no_score());
		const after = { advice: advice.trim() || null };
		await tx.update(unitCondition).set(after).where(idInTenant(unitCondition, recorded.id));
		await recordActivity(tx, {
			action: "updated",
			subject: {
				type: "unitCondition",
				id: recorded.id,
				label: conditionLabel({ serialNumber: found.unit.serialNumber, score: recorded.score }),
			},
			parent: { type: "equipment", id: found.unit.id, label: found.unit.serialNumber },
			before: { advice: recorded.advice },
			after,
		});
		return found;
	});
}

/**
 * The conditions of the unit as a whole (or of its component `componentId`), newest first, with
 * who recorded each and on which order.
 */
export async function conditionsOf(equipmentId: number, componentId: number | null = null) {
	const found = await db
		.select({
			id: unitCondition.id,
			score: unitCondition.score,
			advice: unitCondition.advice,
			source: unitCondition.source,
			recordedAt: unitCondition.recordedAt,
			engineer: engineer.name,
			user: user.name,
			order: order.number,
		})
		.from(unitCondition)
		.leftJoin(...tenantJoin(engineer, unitCondition.engineerId))
		.leftJoin(user, eq(user.id, unitCondition.userId))
		.leftJoin(order, and(eq(order.id, unitCondition.orderId), inTenant(order)))
		.where(
			and(
				eq(unitCondition.equipmentId, equipmentId),
				componentId === null
					? isNull(unitCondition.componentId)
					: eq(unitCondition.componentId, componentId),
				inTenant(unitCondition),
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id));
	return found.map(({ engineer, user, ...row }) => ({ ...row, by: engineer ?? user }));
}
