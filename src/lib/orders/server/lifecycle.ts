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
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order, orderRequest } from "#lib/server/db/schema.ts";

import { can, orderTransitions, plannedStatus, type TransitionRule } from "../lifecycle.ts";
import { OrderRefused, saveOrderParts } from "./hooks.ts";
import { assigneeProblem } from "./order-changes.ts";

/** A move of an order, by its verb, with what that verb needs. */
export type OrderTransition =
	| { verb: "set"; id: number; to: ManualOrderStatus }
	| ({ verb: "plan" } & OrderPlan)
	| { verb: "accept"; id: number; plan?: Omit<OrderPlan, "id"> }
	| { verb: "reject"; id: number; reason: string };

/** Who does one of the tenant's orders (or nobody), on which day and at what time. */
interface OrderPlan {
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
	const found = await tx.query.order.findFirst({ where: idInTenant(order, transition.id) });
	if (!found) error(404, m.orders_not_found_plain());
	if (!can(transition.verb, found.status)) invalid(rule.refusal!(found));
	const moved = { id: found.id, number: found.number };

	const { status, columns } = await target(tx, transition, found.status);
	if (found.status === status && (rule.same ?? "skip") === "skip") return moved;
	const follows = (rule.completedAt ?? "follows") === "follows";
	const values = {
		...columns,
		status,
		// Kept while it stays done, set when it becomes done, cleared otherwise.
		...(follows && {
			completedAt: isDoneOrder(status) ? (found.completedAt ?? Temporal.Now.instant()) : null,
		}),
	};
	await tx.update(order).set(values).where(idInTenant(order, found.id));
	await saveOrderParts({ tx, order: found, status }).catch(refuseRefused);
	if (transition.verb === "accept") await decide(tx, found.id, null);
	if (transition.verb === "reject") await decide(tx, found.id, transition.reason);
	await recordActivity(tx, {
		action: rule.action!,
		subject: { type: "order", id: found.id, label: found.number },
		before: found,
		after: values,
		// The completion date follows from the status.
		...(follows && { ignore: ["completedAt"] }),
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
