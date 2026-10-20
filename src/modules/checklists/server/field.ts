/**
 * Filling a checklist in: answer a point, say what's wrong, write the remark for the customer, and
 * complete it once every point is answered. The same rules for whoever fills it in (`Filler`):
 *
 * - an engineer, in the field, the checklists of their own orders while in progress
 *   (`fieldActions().work`); another engineer's (or tenant's) checklist is a 404, also by a
 *   tampered id;
 * - the office, on the engineer's behalf (a paper form brought back), any of the tenant's while its
 *   order is open (`isOpenOrder()`: not completed, invoiced or cancelled).
 *
 * Only a draft: completed, it's on record. Each change is saved as it's made, in a transaction;
 * completing is logged against the order, and records who completed it: the engineer (none for the
 * office) and the user, either way.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { orderSubject } from "#lib/activity/index.ts";
import { dayOf } from "#lib/dates.ts";
import { unitTitle } from "#lib/equipment/index.ts";
import { isOpenOrder } from "#lib/models.ts";
import { fieldActions } from "#lib/orders/index.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	engineerOrders,
	idInTenant,
	inTenant,
	isSystemUser,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";
import { save } from "#lib/server/extensions.ts";
import { orNotFound } from "#lib/server/records.ts";

import { checklistCompleted } from "../api/extensions.ts";
import { completionProblems, type PointResult, rejections, validUntil } from "../model.ts";
import { checklist, checklistResult } from "./schema.ts";

/**
 * Who fills a checklist in: the signed-in engineer, on one of their own orders in the field
 * (`engineerOrders()`), or the office, on any of the tenant's, on the engineer's behalf.
 */
export type Filler = "engineer" | "office";

/**
 * The tenant's checklist `id`, in `tx`, if `by` may change it: an engineer's on one of their
 * orders, in progress; the office's on an open order; and a draft. A 404 when it isn't theirs, a
 * 400 saying why not otherwise.
 */
async function findFieldChecklist(tx: Transaction, by: Filler, id: number) {
	const found = orNotFound(
		await tx
			.select({
				id: checklist.id,
				name: checklist.name,
				kind: checklist.kind,
				status: checklist.status,
				remarks: checklist.remarks,
				validityMonths: checklist.validityMonths,
				equipmentId: checklist.equipmentId,
				order: {
					id: order.id,
					number: order.number,
					status: order.status,
					engineerId: order.engineerId,
				},
				unit: {
					name: equipment.name,
					manufacturer: equipment.manufacturer,
					model: equipment.model,
				},
			})
			.from(checklist)
			.innerJoin(...tenantJoin(order, checklist.orderId))
			.innerJoin(...tenantJoin(equipment, checklist.equipmentId))
			.where(and(idInTenant(checklist, id), by === "office" ? undefined : await engineerOrders())),
		m.checklists_not_found(),
	);
	if (by === "office" && !isOpenOrder(found.order.status)) {
		error(400, m.checklists_office_order_closed({ number: found.order.number }));
	}
	if (by !== "office" && !fieldActions(found.order.status).work) {
		error(400, m.checklists_field_not_in_progress({ number: found.order.number }));
	}
	if (found.status === "completed") {
		error(400, m.checklists_already_completed({ unit: unitTitle(found.unit) }));
	}
	return found;
}

/** The tenant's point `id` of a checklist `by` may change (see `findFieldChecklist()`). */
async function findFieldPoint(tx: Transaction, by: Filler, id: number) {
	const found = orNotFound(
		await tx
			.select({ id: checklistResult.id, checklistId: checklistResult.checklistId })
			.from(checklistResult)
			.where(idInTenant(checklistResult, id)),
		m.checklists_not_found(),
	);
	const owner = await findFieldChecklist(tx, by, found.checklistId);
	return { ...found, number: owner.order.number };
}

/** Gives a point of a checklist `by` may change its result; returns the order's number. */
export function answerPoint(by: Filler, id: number, result: PointResult | null) {
	return db.transaction(async (tx) => {
		const point = await findFieldPoint(tx, by, id);
		await tx.update(checklistResult).set({ result }).where(idInTenant(checklistResult, id));
		return point.number;
	});
}

/** Sets the remark on a point of a checklist `by` may change (none when empty). */
export function remarkPoint(by: Filler, id: number, remark: string) {
	return db.transaction(async (tx) => {
		const point = await findFieldPoint(tx, by, id);
		await tx
			.update(checklistResult)
			.set({ remark: remark || null })
			.where(idInTenant(checklistResult, id));
		return point.number;
	});
}

/** Sets the general remark for the customer on a checklist `by` may change. */
export function remarkChecklist(by: Filler, id: number, remarks: string) {
	return db.transaction(async (tx) => {
		const found = await findFieldChecklist(tx, by, id);
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
 * Completes a checklist `by` may change, once every point has a result and every rejection says
 * what's wrong: it's on record then, completed now by them (the engineer, or none for the office;
 * the user either way), and an inspection is valid from today (in the user's time zone) for its
 * template's months. Logged against the order, with how many points it rejected and its remark for
 * the customer (the condition module's service history reads it there); the modules save
 * their part in the same transaction (`checklists.completed`: the condition module records the
 * unit's score). Returns the order's number.
 */
export function completeChecklist(by: Filler, id: number) {
	return db.transaction(async (tx) => {
		const found = await findFieldChecklist(tx, by, id);
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
		const today = dayOf(now);
		// The engineer's own order (the scope): its engineer is them.
		const engineerId = by === "office" ? null : found.order.engineerId;
		const { user } = currentTenant();
		const after = {
			status: "completed" as const,
			completedAt: now,
			completedBy: engineerId,
			completedByUser: isSystemUser(user) ? null : user.id,
			validUntil: found.kind === "inspection" ? validUntil(today, found.validityMonths) : null,
		};
		await tx.update(checklist).set(after).where(idInTenant(checklist, id));
		await recordActivity(tx, {
			action: "completed",
			subject: { type: "checklist", id, label: `${found.name} · ${unitTitle(found.unit)}` },
			parent: orderSubject(found.order),
			before: { status: found.status },
			after: { status: after.status, remarks: found.remarks ?? undefined },
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
