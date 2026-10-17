/**
 * What an engineer does with the checklists of one of their own orders in the field: answer a
 * point, say what's wrong, write the remark for the customer, and complete a checklist once every
 * point is answered. Only while the order is in progress (`fieldActions().work`) and the checklist
 * a draft; another engineer's (or tenant's) checklist is a 404, also by a tampered id. Each change is
 * saved as it's made, in a transaction; completing is logged against the order.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { unitTitle } from "#lib/equipment/index.ts";
import { fieldActions } from "#lib/orders/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";
import { save } from "#lib/server/extensions.ts";

import { checklistCompleted } from "../api/extensions.ts";
import { completionProblems, type PointResult, rejections, validUntil } from "../model.ts";
import { checklist, checklistResult } from "./schema.ts";

/**
 * The tenant's checklist `id` on one of the engineer's orders, in `tx`, if they may change it: the
 * order in progress and the checklist a draft. A 404 when it isn't theirs, a 400 saying why not
 * otherwise.
 */
async function findFieldChecklist(tx: Transaction, engineerId: number, id: number) {
	const [found] = await tx
		.select({
			id: checklist.id,
			name: checklist.name,
			kind: checklist.kind,
			status: checklist.status,
			validityMonths: checklist.validityMonths,
			equipmentId: checklist.equipmentId,
			order: { id: order.id, number: order.number, status: order.status },
			unit: { name: equipment.name, manufacturer: equipment.manufacturer, model: equipment.model },
		})
		.from(checklist)
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
		.where(and(idInTenant(checklist, id), eq(order.engineerId, engineerId)));
	if (!found) error(404, m.checklists_not_found());
	if (!fieldActions(found.order.status).work) {
		error(400, m.checklists_field_not_in_progress({ number: found.order.number }));
	}
	if (found.status === "completed") {
		error(400, m.checklists_already_completed({ unit: unitTitle(found.unit) }));
	}
	return found;
}

/** The tenant's point `id` of a checklist the engineer may change (see `findFieldChecklist()`). */
async function findFieldPoint(tx: Transaction, engineerId: number, id: number) {
	const [found] = await tx
		.select({ id: checklistResult.id, checklistId: checklistResult.checklistId })
		.from(checklistResult)
		.where(idInTenant(checklistResult, id));
	if (!found) error(404, m.checklists_not_found());
	const owner = await findFieldChecklist(tx, engineerId, found.checklistId);
	return { ...found, number: owner.order.number };
}

/** Gives a point of one of the engineer's checklists its result; returns the order's number. */
export function answerPoint(engineerId: number, id: number, result: PointResult | null) {
	return db.transaction(async (tx) => {
		const point = await findFieldPoint(tx, engineerId, id);
		await tx.update(checklistResult).set({ result }).where(idInTenant(checklistResult, id));
		return point.number;
	});
}

/** Sets the remark on a point of one of the engineer's checklists (none when empty). */
export function remarkPoint(engineerId: number, id: number, remark: string) {
	return db.transaction(async (tx) => {
		const point = await findFieldPoint(tx, engineerId, id);
		await tx
			.update(checklistResult)
			.set({ remark: remark || null })
			.where(idInTenant(checklistResult, id));
		return point.number;
	});
}

/** Sets the general remark for the customer on one of the engineer's checklists. */
export function remarkChecklist(engineerId: number, id: number, remarks: string) {
	return db.transaction(async (tx) => {
		const found = await findFieldChecklist(tx, engineerId, id);
		await tx
			.update(checklist)
			.set({ remarks: remarks || null })
			.where(idInTenant(checklist, id));
		return found.order.number;
	});
}

/** What a completed checklist found, e.g. "2 points rejected" or "All in order". */
const rejectionsNote = (count: number) =>
	count ? m.checklists_rejections({ count }) : m.checklists_approved();

/**
 * Completes one of the engineer's checklists, once every point has a result and every rejection
 * says what's wrong: it's on record then, completed now by them, and an inspection is valid from
 * today (in the user's time zone) for its template's months. Logged against the order, with how
 * many points it rejected; the modules save their part in the same transaction
 * (`checklists.completed`: the condition module records the unit's score). Returns the order's
 * number.
 */
export function completeChecklist(engineerId: number, id: number) {
	return db.transaction(async (tx) => {
		const found = await findFieldChecklist(tx, engineerId, id);
		const answers = await tx
			.select({
				templateItemId: checklistResult.templateItemId,
				result: checklistResult.result,
				remark: checklistResult.remark,
			})
			.from(checklistResult)
			.where(and(eq(checklistResult.checklistId, id), inTenant(checklistResult)));
		const { unanswered, unexplained } = completionProblems(answers);
		if (unanswered) error(400, m.checklists_complete_unanswered({ count: unanswered }));
		if (unexplained) error(400, m.checklists_complete_unexplained({ count: unexplained }));
		const now = Temporal.Now.instant();
		const today = now.toZonedDateTimeISO(getTimeZone()).toPlainDate();
		const after = {
			status: "completed" as const,
			completedAt: now,
			completedBy: engineerId,
			validUntil: found.kind === "inspection" ? validUntil(today, found.validityMonths) : null,
		};
		await tx.update(checklist).set(after).where(idInTenant(checklist, id));
		await recordActivity(tx, {
			action: "completed",
			subject: { type: "checklist", id, label: `${found.name} · ${unitTitle(found.unit)}` },
			parent: { type: "order", id: found.order.id, label: found.order.number },
			before: { status: found.status },
			after: { status: after.status },
			// Stored, in the language of whoever completes it.
			note: rejectionsNote(rejections(answers)),
		});
		// The modules' part of it (the condition module's scores), in this transaction.
		const problems = await save(checklistCompleted, {
			tx,
			checklist: {
				id,
				kind: found.kind,
				orderId: found.order.id,
				equipmentId: found.equipmentId,
				engineerId,
			},
			points: answers.map(({ templateItemId, result }) => ({ templateItemId, result })),
		});
		if (problems.length) error(400, problems[0].message);
		return found.order.number;
	});
}
