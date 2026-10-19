import { invalid } from "@sveltejs/kit";

import { engineerOrder, engineerOrderNotFound, type OrderRef } from "#lib/server/auth/index.ts";
import type { db, Transaction } from "#lib/server/db/index.ts";

import { type FieldAction, fieldActions, fieldRefusal } from "../lifecycle.ts";

/**
 * One of the signed-in engineer's orders (`engineerOrder()`), by id or number, in a transaction or
 * not; with an `action`, only if they may do it with the order in its current status (see
 * `fieldActions`). Otherwise the scope's 404 (not theirs) or what's in the way. The engineer portal
 * and the modules that add to its order page share it.
 */
export async function findEngineerOrder(
	runner: Transaction | typeof db,
	ref: OrderRef,
	action?: FieldAction,
) {
	const found = await runner.query.order.findFirst({
		columns: { id: true, number: true, status: true, laborHours: true },
		where: await engineerOrder(ref),
	});
	if (!found) engineerOrderNotFound(ref);
	if (action && !fieldActions(found.status)[action]) invalid(fieldRefusal(found.status));
	return found;
}
