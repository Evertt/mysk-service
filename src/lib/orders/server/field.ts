import { error, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { idInTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

import { type FieldAction, fieldActions, fieldRefusal } from "../lifecycle.ts";

/**
 * One of the engineer's (`engineerId`) orders, in a transaction, if they may do `action` with it
 * in its current status (see `fieldActions`); otherwise a 404 (not theirs) or what's in the way.
 * The engineer portal and the modules that add to its order page share it.
 */
export async function findEngineerOrder(
	tx: Transaction,
	engineerId: number,
	orderId: number,
	action: FieldAction,
) {
	const found = await tx.query.order.findFirst({
		columns: { id: true, number: true, status: true, laborHours: true },
		where: and(idInTenant(order, orderId), eq(order.engineerId, engineerId)),
	});
	if (!found) error(404, m.portal_not_found_plain());
	if (!fieldActions(found.status)[action]) invalid(fieldRefusal(found.status));
	return found;
}
