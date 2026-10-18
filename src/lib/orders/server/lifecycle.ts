/**
 * Moving one of the tenant's orders from one status to another, by a verb of the transition table
 * (`orderTransitions` in `../lifecycle.ts`): the check, the change, the modules' parts and the
 * activity entry, always in the caller's transaction.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, eq, isNull } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { isDoneOrder, type ManualOrderStatus, type OrderStatus } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import {
	currentEngineer,
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
} from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order, orderRequest, orderSignoff } from "#lib/server/db/schema.ts";

import type { OrderFormParts } from "../extensions.ts";
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
	  }
	| InvoicingTransition;

/** A move of one order (all but invoicing's). */
type SingleTransition = Exclude<OrderTransition, InvoicingTransition>;

/** Invoicing's move of an invoice's orders, as loaded (their status is what it was). */
type InvoicingTransition = ({ verb: "invoice" } | { verb: "uninvoice" }) & {
	orders: readonly { id: number; number: string; status: OrderStatus }[];
	/** Why, stored with each order's entry (in the language of whoever makes the change). */
	note: string;
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
	transition: SingleTransition,
): Promise<{ id: number; number: string }>;
/** Moves the current tenant's orders of an invoice, in `tx`. */
export async function transitionOrder(
	tx: Transaction,
	transition: InvoicingTransition,
): Promise<void>;
export async function transitionOrder(
	tx: Transaction,
	transition: OrderTransition,
): Promise<{ id: number; number: string } | void> {
	if (transition.verb === "invoice" || transition.verb === "uninvoice") {
		return moveInvoiced(tx, transition);
	}
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
async function target(tx: Transaction, transition: SingleTransition, from: OrderStatus) {
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

/** The order form's change of an order: the guard first, the form's own writes, then `finish()`. */
export interface OrderChange {
	/** The order as loaded; undefined for a new one. */
	readonly before: typeof order.$inferSelect | undefined;
	/** The status columns to write with the form's: its status and completion date. */
	readonly columns: { status: ManualOrderStatus; completedAt: Temporal.Instant | null };
	/**
	 * After the form's writes: asks the modules with the form's parts (also when the status stays),
	 * a refusal becoming the form's issues; then, for an edited order, its one `updated` entry.
	 */
	finish(
		saved: { id: number; number: string },
		extra: { form: OrderFormParts; before?: object; after: object },
	): Promise<void>;
}

/**
 * Starts the order form's change of one of the tenant's orders (`id`, or `null` for a new one) to
 * the status `to`, in `tx`: refuses one it can't change (a 404, invoiced, awaiting acceptance).
 */
export async function beginOrderChange(
	tx: Transaction,
	id: number | null,
	to: ManualOrderStatus,
): Promise<OrderChange> {
	const before =
		id === null ? undefined : await tx.query.order.findFirst({ where: idInTenant(order, id) });
	if (id !== null && !before) error(404, m.orders_not_found_plain());
	if (before && !can("set", before.status)) invalid(orderTransitions.set.refusal(before));
	const columns = {
		status: to,
		completedAt: completion("follows", to, before?.completedAt ?? null, Temporal.Now.instant())!,
	};
	return {
		before,
		columns,
		async finish(saved, { form, before: beforeExtra, after }) {
			await saveOrderParts({ tx, order: saved, status: to, form }).catch(refuseParts);
			if (!before) return;
			await recordActivity(tx, {
				action: "updated",
				subject: { type: "order", id: saved.id, label: saved.number },
				before: { ...before, ...beforeExtra },
				after,
				// The completion date follows from the status.
				ignore: ["completedAt"],
			});
		},
	};
}

/**
 * Refuses the order form with the problems of a module that couldn't save its part, each on the
 * field it names (a part's fields are under `modules.<its id>`), or for the whole form.
 */
function refuseParts(thrown: unknown): never {
	if (thrown instanceof OrderRefused) invalid(...thrown.problems);
	throw thrown;
}

/**
 * Moves those of an invoice's orders that the verb moves from their status, with one entry each:
 * they stay done, so they keep their completion date (and get one if they had none).
 */
async function moveInvoiced(tx: Transaction, transition: InvoicingTransition) {
	const rule: TransitionRule = orderTransitions[transition.verb];
	const moving = transition.orders.filter((each) => can(transition.verb, each.status));
	if (!moving.length) return;
	const [status] = rule.to;
	const where = idsInTenant(
		order,
		moving.map((each) => each.id),
	);
	await tx.update(order).set({ status }).where(where);
	await tx
		.update(order)
		.set({ completedAt: Temporal.Now.instant() })
		.where(and(where, isNull(order.completedAt)));
	for (const moved of moving) {
		// One of several orders: the refusal says which.
		await saveOrderParts({ tx, order: moved, status }).catch((thrown: unknown) => {
			if (thrown instanceof OrderRefused) {
				invalid(m.orders_move_refused_for({ number: moved.number, reason: thrown.message }));
			}
			throw thrown;
		});
		await recordActivity(tx, {
			action: rule.action!,
			subject: { type: "order", id: moved.id, label: moved.number },
			before: moved,
			after: { status },
			note: transition.note,
		});
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
async function scope(transition: SingleTransition) {
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
