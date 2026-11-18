/**
 * `condition.fieldPoints`: a point of a checklist the signed-in engineer is filling in, for the
 * condition module, which keeps a rejected point's defect by its id (`checklists.field.rejected`)
 * and asks this first whether the point is the engineer's to change.
 */
import { and, eq } from "drizzle-orm";

import { fieldActions } from "#lib/orders/index.ts";
import { engineerOrders, idInTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { order } from "#lib/server/db/schema.ts";
import type { FieldPoint, FieldPointQuery } from "#modules/condition/api/extensions.ts";

import { checklist, checklistResult } from "./schema.ts";

/**
 * The point `pointId` of the checklist of the unit `equipmentId` on the signed-in engineer's order
 * `number` (`engineerOrders()`), in `tx`; none when it isn't theirs, the unit's or the order's, or
 * the tenant's.
 */
export async function rejectedFieldPoint({
	tx,
	...where
}: FieldPointQuery): Promise<FieldPoint | undefined> {
	const [found] = await tx
		.select({
			id: checklistResult.id,
			text: checklistResult.text,
			result: checklistResult.result,
			status: checklist.status,
			orderStatus: order.status,
		})
		.from(checklistResult)
		.innerJoin(...tenantJoin(checklist, checklistResult.checklistId))
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.where(
			and(
				idInTenant(checklistResult, where.pointId),
				eq(checklist.equipmentId, where.equipmentId),
				eq(order.number, where.number),
				await engineerOrders(),
			),
		);
	if (!found) return undefined;
	return {
		id: found.id,
		text: found.text,
		result: found.result,
		canChange: found.status === "draft" && fieldActions(found.orderStatus).work,
	};
}
