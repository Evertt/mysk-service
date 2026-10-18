/**
 * Orders a customer asks for in the customer portal, and the planner's decision on them. A
 * reported order (`requestOrder()`) is `awaiting_acceptance`: no open work yet, so off the planning
 * board and its backlog, holding no stock, and with no response time running out (a contract's
 * response time counts from the report, as the customer made it, see the contracts module). A
 * planner accepts it (`acceptOrder()`: it's then a quote, or scheduled when they plan it in the
 * same step) or rejects it with a reason (`rejectOrder()`: it's cancelled, and the customer reads
 * the reason in their portal). Orders made in the office never await acceptance.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { isAwaitingAcceptance } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order, orderRequest } from "#lib/server/db/schema.ts";
import type { Problem } from "#lib/server/forms.ts";

import { createOrders, type OrderDraft } from "./creation.ts";
import { saveOrderParts } from "./hooks.ts";
import type { OrderPlan } from "./lifecycle.ts";
import { scheduleOrder } from "./scheduling.ts";

/** Why an order that isn't awaiting acceptance (any more) can't be accepted or rejected. */
const notAwaiting = (number: string) => m.orders_not_awaiting_acceptance({ number });

/**
 * Creates an order a customer's contact reports in the portal, in `tx`, through `createOrders()`
 * (checked, numbered and logged as created, by them), awaiting acceptance, with who reported it.
 */
export async function requestOrder(
	tx: Transaction,
	draft: Omit<OrderDraft, "status" | "engineerId" | "scheduledFor" | "completedAt" | "laborHours">,
) {
	const { organizationId, user } = currentTenant();
	const [created] = await createOrders(tx, [{ ...draft, status: "awaiting_acceptance" }]);
	await tx
		.insert(orderRequest)
		.values({ orderId: created.id, organizationId, userId: user.id, reporterName: user.name });
	return created;
}

/** One of the tenant's orders awaiting acceptance, or a 404 (none such) or a refusal (decided). */
async function awaitingOrder(tx: Transaction, id: number) {
	const found = await tx.query.order.findFirst({
		columns: { id: true, number: true, status: true, completedAt: true },
		where: idInTenant(order, id),
	});
	if (!found) error(404, m.orders_not_found_plain());
	if (!isAwaitingAcceptance(found.status)) invalid(notAwaiting(found.number));
	return found;
}

/** Notes on the order's request who decided, and when (and why, for a rejection). */
async function decide(tx: Transaction, orderId: number, rejectionReason: string | null) {
	const { user } = currentTenant();
	await tx
		.update(orderRequest)
		.set({ decidedAt: Temporal.Now.instant(), decidedBy: user.id, rejectionReason })
		.where(and(eq(orderRequest.orderId, orderId), inTenant(orderRequest)));
}

/**
 * Accepts one of the tenant's orders awaiting acceptance, in `tx`: it's a quote, with the
 * modules' parts following its status, logged as `accepted`. With `plan`, it's planned in the same
 * step (`scheduleOrder()`, logged as `scheduled`): a quote that gets an engineer is scheduled.
 * Returns what's wrong with the plan (the engineer), and throws an `OrderRefused` when a module
 * refuses, so the caller's transaction stores nothing of it.
 */
export async function acceptOrder(
	tx: Transaction,
	id: number,
	plan?: Omit<OrderPlan, "id">,
): Promise<Problem<"engineerId"> | undefined> {
	const found = await awaitingOrder(tx, id);
	const after = { status: "quote" as const };
	await tx.update(order).set(after).where(idInTenant(order, id));
	await saveOrderParts({ tx, order: found, status: after.status });
	await decide(tx, id, null);
	const subject = { type: "order", id, label: found.number };
	await recordActivity(tx, { action: "accepted", subject, before: found, after });
	return plan ? scheduleOrder(tx, { id, ...plan }) : undefined;
}

/**
 * Rejects one of the tenant's orders awaiting acceptance, in `tx`, for `reason` (stored, in the
 * language of whoever writes it, and shown to the customer): it's cancelled, logged as `rejected`
 * with the reason as its note.
 */
export async function rejectOrder(tx: Transaction, id: number, reason: string) {
	const found = await awaitingOrder(tx, id);
	const after = { status: "cancelled" as const };
	await tx.update(order).set(after).where(idInTenant(order, id));
	await saveOrderParts({ tx, order: found, status: after.status });
	await decide(tx, id, reason);
	const subject = { type: "order", id, label: found.number };
	await recordActivity(tx, { action: "rejected", subject, before: found, after, note: reason });
}
