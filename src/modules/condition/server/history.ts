/**
 * The service history ("Activiteitenlog") of the tenant's units, or of a customer's: the activity
 * log's entries of the orders completed on them, the checklists completed (with checklists on, with
 * what they found and the remark for the customer) and the conditions recorded on the units
 * themselves (with their advice), newest first, as the activity feed shows entries (`present()`).
 * A customer's are those whose order, or unit, is the customer's: their subject's or their parent's.
 */
import { and, desc, eq, isNull, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";

import { present } from "#lib/server/activity/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { activity, equipment, order } from "#lib/server/db/schema.ts";

import { unitCondition } from "./schema.ts";

/** The ids of the tenant's records of `table` (as the log keeps them, text) that `where` picks. */
const idsOf = (table: typeof order | typeof equipment, where: SQL) =>
	db
		.select({ id: sql<string>`cast(${table.id} as text)` })
		.from(table)
		.where(and(inTenant(table), where));

/** `column` among the ids `ids` selects; any without it (every customer's). */
const among = (column: SQLWrapper, ids: SQLWrapper | null) =>
	ids ? sql`${column} in ${ids}` : undefined;

/** An order's completion: by the engineer, or its status set to completed on its form. */
const completedOrder = or(
	eq(activity.action, "completed"),
	and(
		eq(activity.action, "updated"),
		sql`json_extract(${activity.changes}, '$.status[1]') = 'completed'`,
	),
);

/** A condition of a unit as a whole: its components' are on its page. Built per request. */
const ofWholeUnit = () =>
	sql`exists ${db
		.select({ id: unitCondition.id })
		.from(unitCondition)
		.where(
			and(
				inTenant(unitCondition),
				sql`${unitCondition.id} = cast(${activity.subjectId} as integer)`,
				isNull(unitCondition.componentId),
			),
		)}`;

/** The newest `limit` entries of the service history of the customer's units (or all). */
export async function serviceHistory(customerId: number | null, limit: number) {
	const orders = customerId === null ? null : idsOf(order, eq(order.customerId, customerId));
	const units = customerId === null ? null : idsOf(equipment, eq(equipment.customerId, customerId));
	const rows = await db
		.select()
		.from(activity)
		.where(
			and(
				inTenant(activity),
				or(
					and(eq(activity.subjectType, "order"), completedOrder, among(activity.subjectId, orders)),
					and(
						eq(activity.subjectType, "checklist"),
						eq(activity.action, "completed"),
						among(activity.parentId, orders),
					),
					and(
						eq(activity.subjectType, "unitCondition"),
						or(eq(activity.action, "recorded"), eq(activity.action, "updated")),
						ofWholeUnit(),
						among(activity.parentId, units),
					),
				),
			),
		)
		.orderBy(desc(activity.id))
		.limit(limit);
	return present(rows);
}
