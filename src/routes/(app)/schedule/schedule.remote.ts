import { error } from "@sveltejs/kit";
import { and, asc, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import * as v from "valibot";

import { addDays } from "#lib/dates.ts";
import { OrderStockShortage } from "#lib/materials/server/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { type OrderPlan, scheduleOrder as planOrder } from "#lib/orders/server/index.ts";
import { date, id } from "#lib/schema.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { refreshRequested } from "#lib/server/lists/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { byPriorityThenAge, startOfWeek } from "./board.ts";
import { moveFields, scheduleFields } from "./schedule-schema.ts";

/** What a card on the board shows of an order. */
const cardColumns = {
	id: order.id,
	number: order.number,
	type: order.type,
	status: order.status,
	priority: order.priority,
	description: order.description,
	engineerId: order.engineerId,
	scheduledFor: order.scheduledFor,
	createdAt: order.createdAt,
	customer: { id: customer.id, name: customer.name },
};

/**
 * The week starting on the Monday of `day` (`yyyy-mm-dd`): the tenant's engineers, the orders
 * scheduled in it (except cancelled ones), and the backlog of open orders without a date.
 */
export const getSchedule = forMembers.query(date(m.schedule_week_required), async (day) => {
	const start = startOfWeek(day);
	const end = addDays(start, 7);

	const [engineers, orders, backlog] = await Promise.all([
		db
			.select({
				id: engineer.id,
				name: engineer.name,
				specialty: engineer.specialty,
				active: engineer.active,
			})
			.from(engineer)
			.where(inTenant(engineer))
			.orderBy(asc(engineer.name)),
		db
			.select(cardColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(
				and(
					inTenant(order),
					gte(order.scheduledFor, start),
					lt(order.scheduledFor, end),
					ne(order.status, "cancelled"),
				),
			)
			.orderBy(asc(order.scheduledFor)),
		db
			.select(cardColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(
				and(inTenant(order), isNull(order.scheduledFor), inArray(order.status, openOrderStatuses)),
			),
	]);
	return { start, engineers, orders, backlog: backlog.sort(byPriorityThenAge) };
});

/**
 * Plans an order of the current tenant (see `scheduleOrder()`): returns what's wrong if it can't be
 * planned, including a shortage of stock; a 404 if there's no such order.
 */
async function plan(input: OrderPlan): Promise<Problem<"engineerId"> | undefined> {
	try {
		return await db.transaction((tx) => planOrder(tx, input));
	} catch (error) {
		// Thrown, so the transaction stores nothing of it.
		if (error instanceof OrderStockShortage) return { message: error.message };
		throw error;
	}
}

/** The schedule dialog: plans an order, with the problems shown at its fields. */
export const scheduleOrder = forMembers.form(
	v.object({ id: id(), ...scheduleFields }),
	async (input, issue) => {
		const problem = await plan(input);
		refuse(issue, problem ? [problem] : []);
		await refreshRequested(getSchedule);
	},
);

/** A drag and drop move on the board; the client shows it right away and undoes it on an error. */
export const moveOrder = forMembers.command(v.object(moveFields), async (input) => {
	const problem = await plan(input);
	if (problem) error(400, problem.message);
	await refreshRequested(getSchedule);
});
