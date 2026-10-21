import { and, eq } from "drizzle-orm";

import { visible } from "#lib/server/access/index.ts";
import { engineerOrderNotFound, type OrderRef } from "#lib/server/auth/index.ts";
import type { db, Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

import { type FieldAction, fieldActions, fieldRefusal } from "../lifecycle.ts";

/**
 * One of the signed-in engineer's orders, by id or number, in a transaction or not: the access
 * registry says it's theirs to touch (`visible("order", "change")`), and with an `action`, only if
 * they may do it with the order in its current status (see `fieldActions`, which stays the
 * lifecycle's). Otherwise the scope's 404 (not theirs, or missing) or what's in the way. The
 * engineer portal and the modules that add to its order page share it.
 */
export async function findEngineerOrder(
	runner: Transaction | typeof db,
	ref: OrderRef,
	action?: FieldAction,
) {
	const theirs = await visible("order", "change");
	if (!theirs) engineerOrderNotFound(ref);
	const named = "id" in ref ? eq(order.id, ref.id) : eq(order.number, ref.number);
	const found = await runner.query.order.findFirst({
		columns: { id: true, number: true, status: true, laborHours: true },
		where: and(named, theirs),
	});
	if (!found) engineerOrderNotFound(ref);
	if (action && !fieldActions(found.status)[action]) throw new Refused(fieldRefusal(found.status));
	return found;
}
