/**
 * Recording a unit's condition: by a member in the office (on the unit's page), or by an engineer
 * in the portal after the unit's checklist on one of their orders that's in progress. Each is a
 * new record (the latest is the unit's condition), made and logged in a transaction, against the
 * unit. Another tenant's unit, or another engineer's order, is a 404, also by a tampered id.
 */
import { error } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";

import { fieldActions } from "#lib/orders/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant, isSystemUser, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { engineer, equipment, order, orderUnit, user } from "#lib/server/db/schema.ts";

import { conditionLabel } from "../activity.ts";
import type { ConditionSource } from "../model.ts";
import { unitCondition } from "./schema.ts";

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

/** Records the unit's condition in `tx`, and logs it against the unit. */
async function insertCondition(
	tx: Transaction,
	unit: Unit,
	input: ConditionInput,
	by: { source: ConditionSource; orderId?: number; engineerId?: number },
) {
	const tenant = currentTenant();
	const advice = input.advice.trim() || null;
	const [made] = await tx
		.insert(unitCondition)
		.values({
			organizationId: tenant.organizationId,
			equipmentId: unit.id,
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
			label: conditionLabel({ serialNumber: unit.serialNumber, score: input.score }),
		},
		parent: { type: "equipment", id: unit.id, label: unit.serialNumber },
		// The advice, as it was given.
		note: advice,
	});
	return made.id;
}

/** Records the condition of the tenant's unit `serialNumber`, by a member in the office. */
export function recordOfficeCondition(serialNumber: string, input: ConditionInput) {
	return db.transaction(async (tx) => {
		const [unit] = await tx
			.select({ id: equipment.id, serialNumber: equipment.serialNumber })
			.from(equipment)
			.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
		if (!unit) error(404, m.condition_unit_not_found({ serial: serialNumber }));
		await insertCondition(tx, unit, input, { source: "office" });
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

/**
 * Records the condition of a unit on one of the engineer's orders, while it's in progress (after
 * the unit's checklist, see the checklists' card in the portal): on that order, by them.
 */
export function recordFieldCondition(
	engineerId: number,
	number: string,
	equipmentId: number,
	input: ConditionInput,
) {
	return db.transaction(async (tx) => {
		const found = await findFieldUnit(tx, engineerId, number, equipmentId);
		if (!fieldActions(found.order.status).work) {
			error(400, m.condition_not_in_progress({ number }));
		}
		await insertCondition(tx, found.unit, input, {
			source: "checklist",
			orderId: found.order.id,
			engineerId,
		});
		return found;
	});
}

/** The unit's conditions, newest first, with who recorded each and on which order. */
export async function conditionsOf(equipmentId: number, where?: { orderId: number }) {
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
				inTenant(unitCondition),
				where ? eq(unitCondition.orderId, where.orderId) : undefined,
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id));
	return found.map(({ engineer, user, ...row }) => ({ ...row, by: engineer ?? user }));
}
