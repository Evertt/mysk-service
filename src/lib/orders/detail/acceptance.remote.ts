/**
 * Accepting or rejecting an order a customer reported in the customer portal, from the order's
 * page (see `../server/acceptance.ts`): any office member, as planning is. Accepting can plan it in
 * the same step (an engineer, a day and a time); rejecting needs a reason, which the customer
 * reads in their portal.
 */
import { getRequestEvent } from "$app/server";
import { invalid } from "@sveltejs/kit";
import { and, asc, count, eq } from "drizzle-orm";
import * as v from "valibot";

import { id, optionalDate, optionalId, optionalTime, text } from "#lib/schema.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { watchChanges } from "#lib/server/changes.ts";
import { db, inThisRequest } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { getOrder } from "../order.remote.ts";
import { acceptOrder as accept, rejectOrder as reject } from "../server/acceptance.ts";
import { orderCommitted, OrderRefused } from "../server/hooks.ts";

/** The engineers an accepted order can be planned for: the tenant's active ones. */
export const getAcceptanceOptions = forMembers.query(async () => ({
	engineers: await db
		.select({ id: engineer.id, name: engineer.name, specialty: engineer.specialty })
		.from(engineer)
		.where(and(inTenant(engineer), eq(engineer.active, true)))
		.orderBy(asc(engineer.name)),
}));

/** How many of the tenant `organizationId`'s orders await acceptance. */
async function awaitingCount(organizationId: string) {
	const [row] = await db
		.select({ count: count() })
		.from(order)
		// The tenant the live query's gate admitted, read once (`currentTenant()`), as `inTenant()`.
		.where(and(eq(order.organizationId, organizationId), eq(order.status, "awaiting_acceptance")));
	return row?.count ?? 0;
}

/**
 * How many of the tenant's orders await acceptance, for the badge on the sidebar's Orders, sent
 * again whenever an order changes (a customer reports one, a planner accepts or rejects one).
 */
export const watchAwaitingAcceptance = forMembers.query.live(async function* () {
	const { organizationId } = currentTenant();
	// Watching before the first answer, so a change in between isn't missed.
	const changes = watchChanges(organizationId, ["order"]);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	const again = inThisRequest();
	try {
		yield await awaitingCount(organizationId);
		for await (const _ of changes) yield await again(() => awaitingCount(organizationId));
	} finally {
		changes.stop();
	}
});

/** A plan that can't be made: thrown, so the transaction stores none of the acceptance either. */
class PlanRefused extends Error {
	constructor(readonly problem: Problem<"engineerId">) {
		super(problem.message);
	}
}

/** The order's number, to refresh its page by. */
async function numberOf(orderId: number) {
	const [found] = await db
		.select({ number: order.number })
		.from(order)
		.where(idInTenant(order, orderId));
	return found?.number;
}

/**
 * Accepts one of the tenant's orders awaiting acceptance: a quote, or, with a day (and an
 * engineer), planned at once. Refused with the plan's problems (the engineer, the day), or a
 * module's (e.g. a shortage of stock).
 */
export const acceptReportedOrder = forMembers.form(
	v.object({
		id: id(),
		engineerId: optionalId(),
		day: optionalDate(),
		time: optionalTime(),
	}),
	async (input, issue) => {
		if (input.engineerId !== null && input.day === null) {
			invalid(issue.day(m.orders_accept_day_required()));
		}
		const plan = input.day
			? { engineerId: input.engineerId, day: input.day, time: input.time ?? "08:00" }
			: undefined;
		try {
			await db.transaction(async (tx) => {
				const problem = await accept(tx, input.id, plan);
				if (problem) throw new PlanRefused(problem);
			});
		} catch (error) {
			if (error instanceof PlanRefused) refuse(issue, [error.problem]);
			if (error instanceof OrderRefused) invalid(error.message);
			throw error;
		}
		const number = await numberOf(input.id);
		if (number) {
			void getOrder(number).refresh();
			orderCommitted({ number });
		}
	},
);

/** The longest reason a rejection can give. */
const MAX_REASON = 1000;

/** Rejects one of the tenant's orders awaiting acceptance, for a reason the customer reads. */
export const rejectReportedOrder = forMembers.form(
	v.object({ id: id(), reason: text(m.orders_reject_reason_required) }),
	async (input, issue) => {
		if (input.reason.length > MAX_REASON) invalid(issue.reason(m.orders_reject_reason_too_long()));
		try {
			await db.transaction((tx) => reject(tx, input.id, input.reason));
		} catch (error) {
			if (error instanceof OrderRefused) invalid(error.message);
			throw error;
		}
		const number = await numberOf(input.id);
		if (number) {
			void getOrder(number).refresh();
			orderCommitted({ number });
		}
	},
);
