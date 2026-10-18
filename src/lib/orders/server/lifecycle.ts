/**
 * Moving one of the tenant's orders from one status to another, by a verb of the transition table
 * (`orderTransitions` in `../lifecycle.ts`): the check, the change, the modules' parts and the
 * activity entry, always in the caller's transaction.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { isDoneOrder, type ManualOrderStatus, type OrderStatus } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentEngineer, currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order, orderRequest, orderSignoff } from "#lib/server/db/schema.ts";

import { can, orderTransitions, plannedStatus, type TransitionRule } from "../lifecycle.ts";
import { OrderRefused, saveOrderParts } from "./hooks.ts";
import { assigneeProblem } from "./order-changes.ts";

/** A move of an order, by its verb, with what that verb needs. */
export type OrderTransition =
	| { verb: "set"; id: number; to: ManualOrderStatus }
	| ({ verb: "plan" } & OrderPlan)
	| { verb: "accept"; id: number; plan?: Omit<OrderPlan, "id"> }
	| { verb: "reject"; id: number; reason: string }
	| { verb: "start"; id: number }
	| {
			verb: "complete";
			id: number;
			/** The work order's sign-off: the customer's name and signature, and the engineer's. */
			signoff: { signerName: string; signature: string; engineerSignature: string };
	  };

/** Who does one of the tenant's orders (or nobody), on which day and at what time. */
export interface OrderPlan {
	id: number;
	engineerId: number | null;
	day: Temporal.PlainDate;
	/** `HH:MM`, in the user's time zone. */
	time: string;
}

/** Moves one of the current tenant's orders, in `tx`. Resolves to the order it moved. */
export async function transitionOrder(
	tx: Transaction,
	transition: OrderTransition,
): Promise<{ id: number; number: string }> {
	const rule: TransitionRule = orderTransitions[transition.verb];
	const found = await tx.query.order.findFirst({ where: await scope(transition) });
	if (!found) {
		error(404, rule.by === "engineer" ? m.portal_not_found_plain() : m.orders_not_found_plain());
	}
	if (!can(transition.verb, found.status)) invalid(rule.refusal!(found));
	const moved = { id: found.id, number: found.number };

	const { status, columns } = await target(tx, transition, found.status);
	if (found.status === status && (rule.same ?? "skip") === "skip") return moved;
	const at = Temporal.Now.instant();
	const completedAt = completion(rule.completedAt ?? "follows", status, found.completedAt, at);
	const values = { ...columns, status, ...(completedAt !== undefined && { completedAt }) };
	await tx.update(order).set(values).where(idInTenant(order, found.id));
	await saveOrderParts({ tx, order: found, status }).catch(refuseRefused);
	if (transition.verb === "accept") await decide(tx, found.id, null);
	if (transition.verb === "reject") await decide(tx, found.id, transition.reason);
	if (transition.verb === "complete") await signOff(tx, found.id, transition.signoff, at);
	await recordActivity(tx, {
		action: rule.action!,
		subject: { type: "order", id: found.id, label: found.number },
		before: found,
		after: {
			...values,
			// Who signed it off for the customer.
			...(transition.verb === "complete" && { signedBy: transition.signoff.signerName }),
		},
		// The completion date follows from the status.
		...(completedAt !== undefined && { ignore: ["completedAt"] }),
		// Stored, in the language of whoever writes it, and shown to the customer.
		...(transition.verb === "reject" && { note: transition.reason }),
	});
	// Accepted and planned in one step: planned as the planner would, in the same transaction.
	if (transition.verb === "accept" && transition.plan) {
		await transitionOrder(tx, { verb: "plan", id: found.id, ...transition.plan });
	}
	return moved;
}

/**
 * The status `transition` moves an order with `from` to, and the other columns it sets with it;
 * refuses a plan's engineer that can't be assigned.
 */
async function target(tx: Transaction, transition: OrderTransition, from: OrderStatus) {
	switch (transition.verb) {
		case "set":
			return { status: transition.to, columns: {} };
		case "accept":
			return { status: "quote" as const, columns: {} };
		case "reject":
			return { status: "cancelled" as const, columns: {} };
		case "start":
			return { status: "in_progress" as const, columns: {} };
		case "complete":
			return { status: "completed" as const, columns: {} };
		case "plan": {
			const { engineerId, day, time } = transition;
			if (engineerId !== null) {
				const problem = await assigneeProblem(engineerId, tx);
				if (problem) invalid({ message: problem, path: ["engineerId"] });
			}
			const scheduledFor = day
				.toZonedDateTime({ timeZone: getTimeZone(), plainTime: time })
				.toInstant();
			return { status: plannedStatus(from, engineerId), columns: { engineerId, scheduledFor } };
		}
		default: {
			const unknown: never = transition;
			throw new Error(`Unknown transition: ${JSON.stringify(unknown)}`);
		}
	}
}

/**
 * The completion date a move to `status` writes, by its rule: kept while it stays done, set when
 * it becomes done, cleared otherwise ("follows"); the move's moment ("at"); or none (`undefined`).
 */
function completion(
	rule: "follows" | "at" | "untouched",
	status: OrderStatus,
	current: Temporal.Instant | null,
	at: Temporal.Instant,
) {
	if (rule === "untouched") return undefined;
	if (rule === "at") return at;
	return isDoneOrder(status) ? (current ?? at) : null;
}

/**
 * Stores the work order's sign-off of a completed order, signed at `at`: the customer's name and
 * signature, and the engineer's, in their name as the tenant knows them (not one the form sent).
 */
async function signOff(
	tx: Transaction,
	orderId: number,
	signed: { signerName: string; signature: string; engineerSignature: string },
	at: Temporal.Instant,
) {
	const { organizationId, user } = currentTenant();
	const signoff = {
		...signed,
		engineerName: (await currentEngineer()).name,
		userId: user.id,
		signedAt: at,
	};
	await tx
		.insert(orderSignoff)
		.values({ orderId, organizationId, ...signoff })
		.onConflictDoUpdate({ target: orderSignoff.orderId, set: signoff });
}

/** The order `transition` moves, as its actor may see it: the tenant's; the engineer's own. */
async function scope(transition: OrderTransition) {
	const own = idInTenant(order, transition.id);
	if (orderTransitions[transition.verb].by !== "engineer") return own;
	return and(own, eq(order.engineerId, (await currentEngineer()).id));
}

/** Notes on the order's request who decided, and when (and why, for a rejection). */
async function decide(tx: Transaction, orderId: number, rejectionReason: string | null) {
	const { user } = currentTenant();
	await tx
		.update(orderRequest)
		.set({ decidedAt: Temporal.Now.instant(), decidedBy: user.id, rejectionReason })
		.where(and(eq(orderRequest.orderId, orderId), inTenant(orderRequest)));
}

/** Refuses with what a module said when it refused its part of the move; rethrows anything else. */
function refuseRefused(thrown: unknown): never {
	if (thrown instanceof OrderRefused) invalid(thrown.message);
	throw thrown;
}
