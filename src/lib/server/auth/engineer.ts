/**
 * The engineer portal's scope: what a field engineer may reach is the tenant's orders assigned to
 * them. Every query of a `forEngineers` remote function (and a module's
 * `moduleRemote(id, "engineer")`) on orders builds its `where` from these, so another engineer's
 * order (or another tenant's) is a 404, also by a tampered id; units and locations stay the
 * tenant's for every engineer (the QR pages). Records reached through an order (a checklist, a
 * unit on an order) join it and add `engineerOrders()`.
 *
 * The signed-in engineer's id is read here only: `currentEngineer()` doesn't hand it out, so code
 * outside this folder can't compare `order.engineerId` with it by hand
 * (`src/tests/unit/lib/server/auth/engineer-scope.spec.ts` checks the rest). A record written with
 * the engineer takes them from the order it reached (`order.engineerId`).
 */
import { error } from "@sveltejs/kit";
import { and, eq, type SQL } from "drizzle-orm";

import { order } from "#lib/server/db/schema.ts";

import { inTenant, requireEngineer } from "./session.ts";

/** How a request named an order: by id (a form's) or by number (the URL's). */
export type OrderRef = { id: number } | { number: string };

/**
 * For a query on `order` (from, joined or `with`): the current tenant's orders assigned to the
 * signed-in engineer. Reads the engineer itself, as `inTenant()` reads the tenant; the lookup is the
 * gate's, so it costs no query.
 */
export async function engineerOrders(): Promise<SQL> {
	const { engineer } = await requireEngineer();
	return and(inTenant(order), eq(order.engineerId, engineer.id))!;
}

/** The one order `ref` names, if it's one of `engineerOrders()`. */
export async function engineerOrder(ref: OrderRef): Promise<SQL> {
	const named = "id" in ref ? eq(order.id, ref.id) : eq(order.number, ref.number);
	return and(named, await engineerOrders())!;
}

/**
 * The one refusal: a 404 that reads the same whether the order is missing, another engineer's or
 * another tenant's, with its number when the request named it.
 */
export function engineerOrderNotFound(ref: OrderRef): never {
	error(
		404,
		"number" in ref ? m.portal_not_found({ number: ref.number }) : m.portal_not_found_plain(),
	);
}
