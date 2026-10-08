import { command, form, query, requested } from "$app/server";
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import * as v from "valibot";

import { isOpenOrder, openOrderStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { atTime, date, id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, order } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { moveOrderStock, OrderStockShortage } from "#lib/server/stock.js";

import { addDays, byPriorityThenAge, plannedStatus, startOfWeek } from "./board.js";
import { moveFields, scheduleFields } from "./schedule-schema.js";

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
export const getSchedule = query(date(m.schedule_week_required), async (day) => {
	requireMember();
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
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
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
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
			.where(
				and(inTenant(order), isNull(order.scheduledFor), inArray(order.status, openOrderStatuses)),
			),
	]);
	return { start, engineers, orders, backlog: backlog.sort(byPriorityThenAge) };
});

type Plan = { id: number; engineerId: number | null; day: Date; time: string };

/**
 * Plans an order of the current tenant: assigns `engineerId` (or nobody) and schedules it on `day`
 * at `time`. A quote that gets scheduled takes its materials from stock. Returns what's wrong if it
 * can't be planned; a 404 if there's no such order.
 */
async function plan(input: Plan): Promise<Problem | undefined> {
	requireMember();
	try {
		return await planInTransaction(input);
	} catch (error) {
		// Thrown, so the transaction stores nothing of it.
		if (error instanceof OrderStockShortage) return { message: error.message };
		throw error;
	}
}

type Problem = { field?: "engineerId"; message: string };

function planInTransaction(input: Plan) {
	return db.transaction(async (tx): Promise<Problem | undefined> => {
		const found = await tx.query.order.findFirst({
			columns: { id: true, number: true, status: true, engineerId: true, scheduledFor: true },
			where: and(eq(order.id, input.id), inTenant(order)),
			with: { lines: true },
		});
		if (!found) error(404, m.schedule_not_found());
		if (!isOpenOrder(found.status)) {
			return { message: m.schedule_only_open() };
		}
		if (input.engineerId !== null) {
			const assignee = await tx.query.engineer.findFirst({
				columns: { name: true, active: true },
				where: and(eq(engineer.id, input.engineerId), inTenant(engineer)),
			});
			if (!assignee) return { field: "engineerId", message: m.schedule_unknown_engineer() };
			if (!assignee.active) {
				return {
					field: "engineerId",
					message: m.schedule_engineer_inactive({ name: assignee.name }),
				};
			}
		}
		const planned = {
			engineerId: input.engineerId,
			scheduledFor: atTime(input.day, input.time),
			status: plannedStatus(found.status, input.engineerId),
		};
		await tx
			.update(order)
			.set(planned)
			.where(and(eq(order.id, input.id), inTenant(order)));
		await moveOrderStock(tx, found, found, { status: planned.status, lines: found.lines });
		const subject = { type: "order", id: input.id, label: found.number };
		await recordActivity(tx, { action: "scheduled", subject, before: found, after: planned });
		return undefined;
	});
}

/** The schedule dialog: plans an order, with the problems shown at its fields. */
export const scheduleOrder = form(
	v.object({ id: id(), ...scheduleFields }),
	async (input, issue) => {
		requireMember();
		const problem = await plan(input);
		if (problem) {
			invalid(problem.field ? issue[problem.field](problem.message) : problem.message);
		}
		await requested(getSchedule, 4).refreshAll();
	},
);

/** A drag and drop move on the board; the client shows it right away and undoes it on an error. */
export const moveOrder = command(v.object(moveFields), async (input) => {
	requireMember();
	const problem = await plan(input);
	if (problem) error(400, problem.message);
	await requested(getSchedule, 4).refreshAll();
});
