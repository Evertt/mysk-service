import { getRequestEvent } from "$app/server";
import { error, isValidationError } from "@sveltejs/kit";
import { and, asc, isNull, ne } from "drizzle-orm";
import * as v from "valibot";

import { type EngineerSpecialty, openOrderStatuses } from "#lib/models.ts";
import {
	type ListedUnit,
	type OrderPlan,
	transitionOrder,
	withFirstUnit,
} from "#lib/orders/server/index.ts";
import { date, id } from "#lib/schema.ts";
import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { changedAt, watchChanges } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import {
	customer,
	engineer,
	equipment,
	equipmentCategory,
	order,
	orderUnit,
} from "#lib/server/db/schema.ts";
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

/**
 * What the board shows of its orders: their first unit and how many they have (as `withFirstUnit()`
 * has them, for the card), and the specialties that service their units' categories
 * (`specialties`, first unit first, `null` for a category without one): whose engineers the
 * schedule dialog lists first. One query for both.
 */
async function forBoard<T extends { id: number }>(orders: T[]) {
	const units = new Map(
		orders.map((row) => [
			row.id,
			[] as { unit: ListedUnit; specialty: EngineerSpecialty | null }[],
		]),
	);
	if (orders.length) {
		const rows = await db
			.select({
				orderId: orderUnit.orderId,
				specialty: equipmentCategory.specialty,
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				name: equipment.name,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
			})
			.from(orderUnit)
			.innerJoin(...tenantJoin(equipment, orderUnit.equipmentId))
			.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
			.where(and(inList(orderUnit.orderId, [...units.keys()]), inTenant(orderUnit)))
			.orderBy(asc(orderUnit.orderId), asc(orderUnit.position));
		for (const { orderId, specialty, ...unit } of rows) {
			units.get(orderId)?.push({ unit, specialty });
		}
	}
	return orders.map((row) => {
		const own = units.get(row.id) ?? [];
		return {
			...row,
			unit: own[0]?.unit ?? null,
			unitCount: own.length,
			specialties: own.map((each) => each.specialty),
		};
	});
}

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

/** The records the board shows: a change to any of them outdates it. */
const boardSubjects = ["order", "engineer", "customer"] as const;

/**
 * When the board's records last changed (see `watchSchedule`), read before them: a board or month
 * whose live query opens on a later change than its data's asks for it again. Changes are timed
 * in milliseconds, so one announced in this millisecond leaves it a millisecond earlier: another
 * change in the same millisecond, after the read, still counts as later (`>` on the client). That
 * asks once too many when there's none, which takes reading in the millisecond of a change.
 */
function readAt() {
	const changed = changedAt(currentTenant().organizationId, boardSubjects);
	return changed && changed >= Date.now() ? changed - 1 : changed;
}

/**
 * The week starting on the Monday of `day` (`yyyy-mm-dd`): the tenant's engineers, the orders
 * scheduled in it (except cancelled ones), and the backlog of open orders without a date, and when
 * the board's records had last changed as it was read (`changedAt`).
 */
export const getSchedule = query(date(m.schedule_week_required), async (day) => {
	const changed = readAt();
	const start = mondayOf(day);
	const week = { from: start.toString(), to: start.add({ days: 6 }).toString() };

	const [team, orders, backlog] = await Promise.all([
		engineers(),
		scheduledIn(week).then(forBoard),
		db
			.select(cardColumns)
			.from(order)
			.innerJoin(...tenantJoin(customer, order.customerId))
			.where(
				and(inTenant(order), isNull(order.scheduledFor), inList(order.status, openOrderStatuses)),
			)
			.then(forBoard),
	]);
	return {
		start,
		engineers: team,
		orders,
		backlog: backlog.sort(byPriorityThenAge),
		changedAt: changed,
	};
});

/**
 * The calendar of the month `day` (`yyyy-mm-dd`) is in: its first day (`month`), the orders
 * scheduled in its six weeks (except cancelled ones; the days around the month included) and the
 * tenant's engineers. The server sets the range, so no request loads more than six weeks.
 */
export const getScheduleMonth = query(date(m.schedule_date_required), async (day) => {
	const changed = readAt();
	const range = monthRange(day);
	const [team, orders] = await Promise.all([engineers(), scheduledIn(range).then(withFirstUnit)]);
	return { month: day.with({ day: 1 }), engineers: team, orders, changedAt: changed };
});

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
 * Plans an order of the current tenant (see `transitionOrder()`'s `plan`): refused with what's
 * wrong (it isn't open, the engineer, a shortage of stock); a 404 if there's no such order.
 */
const plan = (input: OrderPlan) =>
	db.transaction((tx) => transitionOrder(tx, { verb: "plan", ...input }));

/** The schedule dialog: plans an order, with the problems shown at its fields. */
export const scheduleOrder = form(v.object({ id: id(), ...scheduleFields }), async (input) => {
	await plan(input);
	await refreshRequested(getSchedule);
});

/** A drag and drop move; the client shows it right away and undoes it on an error. */
export const moveOrder = command(v.object(moveFields), async (input) => {
	try {
		await plan(input);
	} catch (thrown) {
		if (isValidationError(thrown)) error(400, thrown.issues.map((i) => i.message).join("; "));
		throw thrown;
	}
	await refreshRequested(getSchedule);
});
