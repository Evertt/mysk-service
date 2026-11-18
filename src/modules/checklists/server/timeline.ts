/**
 * The checklists module's part of a unit's timeline (`equipment.timeline`): each inspection or
 * maintenance checklist of the unit completed, with its outcome ("Inspection completed: approved",
 * "… 2 points rejected") and its order, for whoever may read it (the access registry's `checklist`:
 * its order's readers, a customer's contact only once it's completed).
 */
import { and, desc, eq, lte, sql } from "drizzle-orm";

import type { TimelineQuery } from "#lib/equipment/extensions.ts";
import { answerOf, type TimelineAnswer } from "#lib/equipment/index.ts";
import { visible } from "#lib/server/access/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

import { checklist, checklistResult } from "./schema.ts";

/** The unit's completed checklists for a page of its timeline. */
export async function checklistTimeline(query: TimelineQuery): Promise<TimelineAnswer> {
	const readable = await visible("checklist", "read", query.viewer);
	if (!readable) return { entries: [], more: false };
	const rows = await db
		.select({
			id: checklist.id,
			name: checklist.name,
			kind: checklist.kind,
			completedAt: checklist.completedAt,
			order: order.number,
			rejected: sql<number>`(select count(*) from ${checklistResult} where ${and(
				eq(checklistResult.checklistId, checklist.id),
				eq(checklistResult.organizationId, checklist.organizationId),
				eq(checklistResult.result, "nok"),
			)})`.mapWith(Number),
		})
		.from(checklist)
		.innerJoin(...tenantJoin(order, checklist.orderId))
		.where(
			and(
				inTenant(checklist),
				eq(checklist.equipmentId, query.unit.id),
				eq(checklist.status, "completed"),
				readable,
				query.before ? lte(checklist.completedAt, query.before.at) : undefined,
			),
		)
		.orderBy(desc(checklist.completedAt), desc(checklist.id))
		.limit(query.limit + 1);
	const entries = rows.flatMap((row) =>
		row.completedAt
			? [
					{
						id: `checklist:${row.id}`,
						at: row.completedAt,
						kind: "checklist.completed",
						title:
							row.kind === "inspection"
								? m.checklists_timeline_inspection({ name: row.name })
								: m.checklists_timeline_maintenance({ name: row.name }),
						detail: row.rejected
							? m.checklists_timeline_rejected({ count: row.rejected })
							: m.checklists_timeline_approved(),
						order: row.order,
						tone: row.rejected ? ("warning" as const) : ("success" as const),
						icon: "inspection" as const,
					},
				]
			: [],
	);
	return answerOf(entries, query.before, query.limit, rows.length > query.limit);
}
