/**
 * Planning an order: who does it and when. The planning board (the schedule module) changes orders
 * only through this, so the order's rules (its status, the modules' parts, its activity entry) stay
 * with orders.
 *
 * The order form doesn't use it: the form sets the status itself, may change the date of an order
 * that is no longer open, and logs its whole save as one `updated` entry; planning does none of
 * that.
 */
import { error } from "@sveltejs/kit";

import { getTimeZone } from "#lib/dates.ts";
import { isOpenOrder } from "#lib/models.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { idInTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import type { Problem } from "#lib/server/forms.ts";

import { plannedStatus } from "../lifecycle.ts";
import { saveOrderParts } from "./hooks.ts";
import type { OrderPlan } from "./lifecycle.ts";
import { assigneeProblem } from "./order-changes.ts";

/**
 * Plans one of the current tenant's open orders in the caller's transaction `tx`: assigns
 * `engineerId` (one of the tenant's active engineers) or nobody, and schedules it on `day` at
 * `time`. A quote that gets an engineer is scheduled (`plannedStatus()`), and the modules' parts
 * follow (e.g. it takes its materials from stock). Logs a `scheduled` entry.
 *
 * Returns what's wrong if it can't be planned (it isn't open; the engineer), a 404 if there's no
 * such order, and throws an `OrderRefused` when a module refuses (e.g. there isn't enough stock),
 * so that the caller's transaction stores nothing of it; the caller turns that into a problem.
 */
export async function scheduleOrder(
	tx: Transaction,
	plan: OrderPlan,
): Promise<Problem<"engineerId"> | undefined> {
	const found = await tx.query.order.findFirst({
		columns: { id: true, number: true, status: true, engineerId: true, scheduledFor: true },
		where: idInTenant(order, plan.id),
	});
	if (!found) error(404, m.orders_not_found_plain());
	if (!isOpenOrder(found.status)) return { message: m.orders_only_open_scheduled() };
	if (plan.engineerId !== null) {
		const problem = await assigneeProblem(plan.engineerId, tx);
		if (problem) return { field: "engineerId", message: problem };
	}
	const planned = {
		engineerId: plan.engineerId,
		scheduledFor: plan.day
			.toZonedDateTime({ timeZone: getTimeZone(), plainTime: plan.time })
			.toInstant(),
		status: plannedStatus(found.status, plan.engineerId),
	};
	await tx.update(order).set(planned).where(idInTenant(order, plan.id));
	await saveOrderParts({ tx, order: found, status: planned.status });
	const subject = { type: "order", id: plan.id, label: found.number };
	await recordActivity(tx, { action: "scheduled", subject, before: found, after: planned });
	return undefined;
}
