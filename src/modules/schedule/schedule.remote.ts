import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, isNull, ne } from "drizzle-orm";
import * as v from "valibot";

import { openOrderStatuses } from "#lib/models.ts";
import {
	type OrderPlan,
	OrderRefused,
	scheduleOrder as planOrder,
} from "#lib/orders/server/index.ts";
import { date, id } from "#lib/schema.ts";
import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { changedAt, watchChanges } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { inDays, refreshRequested } from "#lib/server/lists/index.ts";

import { byPriorityThenAge } from "./board/board.ts";
import { mondayOf, monthRange } from "./calendar/calendar.ts";
import { moveFields, scheduleFields } from "./form/schedule-schema.ts";
import { command, form, query } from "./remote-functions.ts";

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

/** The tenant's engineers, for the rows and names on the board and the calendar. */
const engineers = () =>
	db
		.select({
			id: engineer.id,
			name: engineer.name,
			specialty: engineer.specialty,
			active: engineer.active,
		})
		.from(engineer)
		.where(inTenant(engineer))
		.orderBy(asc(engineer.name));

/** The tenant's orders scheduled on the days `from` to `to` (`yyyy-mm-dd`), except cancelled ones. */
const scheduledIn = (days: { from: string; to: string }) =>
	db
		.select(cardColumns)
		.from(order)
		.innerJoin(...tenantJoin(customer, order.customerId))
		.where(
			and(
				inTenant(order),
				// The days in the user's time zone.
				inDays(order.scheduledFor, [days]),
				ne(order.status, "cancelled"),
			),
		)
		.orderBy(asc(order.scheduledFor));

/**
 * The week starting on the Monday of `day` (`yyyy-mm-dd`): the tenant's engineers, the orders
 * scheduled in it (except cancelled ones), and the backlog of open orders without a date.
 */
export const getSchedule = query(date(m.schedule_week_required), async (day) => {
	const start = mondayOf(day);
	const week = { from: start.toString(), to: start.add({ days: 6 }).toString() };

	const [team, orders, backlog] = await Promise.all([
		engineers(),
		scheduledIn(week),
		db
			.select(cardColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(
				and(inTenant(order), isNull(order.scheduledFor), inList(order.status, openOrderStatuses)),
			),
	]);
	return { start, engineers: team, orders, backlog: backlog.sort(byPriorityThenAge) };
});

/**
 * The calendar of the month `day` (`yyyy-mm-dd`) is in: its first day (`month`), the orders
 * scheduled in its six weeks (except cancelled ones; the days around the month included) and the
 * tenant's engineers. The server sets the range, so no request loads more than six weeks.
 */
export const getScheduleMonth = query(date(m.schedule_date_required), async (day) => {
	const range = monthRange(day);
	const [team, orders] = await Promise.all([engineers(), scheduledIn(range)]);
	return { month: day.with({ day: 1 }), engineers: team, orders };
});

/** The records the board shows: a change to any of them outdates it. */
const boardSubjects = ["order", "engineer", "customer"] as const;

/**
 * When the board's records last changed (epoch ms, 0 if not since the server started), sent again
 * on each change, so an open board refreshes `getSchedule` (and an open month `getScheduleMonth`)
 * when someone else plans an order, an engineer completes one, or an order comes in.
 */
export const watchSchedule = query.live(async function* () {
	const { organizationId } = currentTenant();
	// Watching before the first answer, so a change in between isn't missed.
	const changes = watchChanges(organizationId, boardSubjects);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	try {
		yield changedAt(organizationId, boardSubjects);
		for await (const _ of changes) yield changedAt(organizationId, boardSubjects);
	} finally {
		changes.stop();
	}
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
		if (error instanceof OrderRefused) return { message: error.message };
		throw error;
	}
}

/** The schedule dialog: plans an order, with the problems shown at its fields. */
export const scheduleOrder = form(
	v.object({ id: id(), ...scheduleFields }),
	async (input, issue) => {
		const problem = await plan(input);
		refuse(issue, problem ? [problem] : []);
		await refreshRequested(getSchedule);
	},
);

/** A drag and drop move on the board; the client shows it right away and undoes it on an error. */
export const moveOrder = command(v.object(moveFields), async (input) => {
	const problem = await plan(input);
	if (problem) error(400, problem.message);
	await refreshRequested(getSchedule);
});
