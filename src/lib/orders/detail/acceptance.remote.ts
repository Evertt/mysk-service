/**
 * Accepting or rejecting an order a customer reported in the customer portal, from the order's
 * page (see `../server/acceptance.ts`): any office member, as planning is. Accepting can plan it in
 * the same step (an engineer, a day and a time); rejecting needs a reason, which the customer
 * reads in their portal.
 */
import { invalid } from "@sveltejs/kit";
import { and, asc, count, eq } from "drizzle-orm";
import * as v from "valibot";

import { id, optionalDate, optionalId, optionalTime, text } from "#lib/schema.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";
import { live } from "#lib/server/live.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { getOrder } from "../order.remote.ts";
import { orderCommitted } from "../server/hooks.ts";
import { transitionOrder } from "../server/lifecycle.ts";

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
export const watchAwaitingAcceptance = forMembers.query.live(() => {
	const { organizationId } = currentTenant();
	return live(["order"], () => awaitingCount(organizationId));
});

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
		const { number } = await db.transaction((tx) =>
			transitionOrder(tx, { verb: "accept", id: input.id, plan }),
		);
		void getOrder(number).refresh();
		orderCommitted({ number });
	},
);

/** The longest reason a rejection can give. */
const MAX_REASON = 1000;

/** Rejects one of the tenant's orders awaiting acceptance, for a reason the customer reads. */
export const rejectReportedOrder = forMembers.form(
	v.object({ id: id(), reason: text(m.orders_reject_reason_required) }),
	async (input, issue) => {
		if (input.reason.length > MAX_REASON) invalid(issue.reason(m.orders_reject_reason_too_long()));
		const { number } = await db.transaction((tx) =>
			transitionOrder(tx, { verb: "reject", id: input.id, reason: input.reason }),
		);
		void getOrder(number).refresh();
		orderCommitted({ number });
	},
);
