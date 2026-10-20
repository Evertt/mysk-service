/**
 * What the engineer portal's feed of changes (`watchFieldChanges`) tells a field engineer, of the
 * changes to the tenant's orders and units: those to their own orders (`engineerOrders()`) and to
 * any unit (units are the tenant's for every engineer, as the QR pages show them), without who
 * made them, and of what was done only whether the record is gone.
 */
import { and } from "drizzle-orm";

import { isGone, type TenantChange } from "#lib/activity/index.ts";
import { currentTenant, engineerOrders } from "#lib/server/auth/index.ts";
import type { Change } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";

/** Those of `changes` the signed-in engineer hears of, as their portal's feed presents them. */
export async function fieldChanges(changes: Change[]): Promise<TenantChange[]> {
	const { user } = currentTenant();
	const orderIds = changes.flatMap((change) =>
		change.type === "order" && change.id ? [Number(change.id)] : [],
	);
	const theirs = new Set(
		orderIds.length
			? (
					await db
						.select({ id: order.id })
						.from(order)
						.where(and(inList(order.id, orderIds), await engineerOrders()))
				).map((row) => String(row.id))
			: [],
	);
	return changes
		.filter(
			(change) =>
				change.id &&
				(change.type === "equipment" || (change.type === "order" && theirs.has(change.id))),
		)
		.map((change) => ({
			type: change.type,
			id: change.id!,
			action: isGone(change.action) ? "deleted" : "updated",
			name: "",
			mine: change.user?.id === user.id,
			at: change.at,
		}));
}
