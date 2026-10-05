import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { openOrderStatuses } from "#lib/models.js";
import { id } from "#lib/schema.js";
import { deleteOrRefuse } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, order } from "#lib/server/db/schema.js";
import { laborCost } from "#lib/server/pricing.js";
import { requireUser } from "#lib/server/session.js";

import { engineerFields } from "./engineer-schema.js";

/** Orders that still need work: quoted, scheduled or under way. */

const DAY = 24 * 60 * 60 * 1000;

/** All engineers with the number of open orders assigned to them, by name. */
export const getEngineers = query(async () => {
	requireUser();
	const open = db
		.select({ engineerId: order.engineerId, count: count().as("open_count") })
		.from(order)
		.where(inArray(order.status, openOrderStatuses))
		.groupBy(order.engineerId)
		.as("open");

	return db
		.select({
			id: engineer.id,
			name: engineer.name,
			email: engineer.email,
			phone: engineer.phone,
			specialty: engineer.specialty,
			region: engineer.region,
			hourlyRate: engineer.hourlyRate,
			active: engineer.active,
			hiredAt: engineer.hiredAt,
			openOrders: sql<number>`coalesce(${open.count}, 0)`,
		})
		.from(engineer)
		.leftJoin(open, eq(open.engineerId, engineer.id))
		.orderBy(asc(engineer.name));
});

/** Parses an id from the URL, or a 404. */
function parseId(value: string) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) error(404, `Engineer ${value} not found`);
	return parsed;
}

/** One engineer with their open and recently completed orders and last month's numbers. */
export const getEngineer = query(v.string(), async (param) => {
	requireUser();
	const engineerId = parseId(param);
	const found = await db.query.engineer.findFirst({ where: eq(engineer.id, engineerId) });
	if (!found) error(404, `Engineer ${param} not found`);

	const columns = {
		id: order.id,
		number: order.number,
		type: order.type,
		status: order.status,
		description: order.description,
		scheduledFor: order.scheduledFor,
		completedAt: order.completedAt,
		laborHours: order.laborHours,
		customer: { id: customer.id, code: customer.code, name: customer.name },
	};
	const since = new Date(Date.now() - 30 * DAY);

	const [openOrders, completedOrders, lastMonth] = await Promise.all([
		// Soonest first; unscheduled work (e.g. quotes) last.
		db
			.select(columns)
			.from(order)
			.innerJoin(customer, eq(order.customerId, customer.id))
			.where(and(eq(order.engineerId, engineerId), inArray(order.status, openOrderStatuses)))
			.orderBy(sql`${order.scheduledFor} is null`, asc(order.scheduledFor), asc(order.id)),
		db
			.select(columns)
			.from(order)
			.innerJoin(customer, eq(order.customerId, customer.id))
			.where(and(eq(order.engineerId, engineerId), isNotNull(order.completedAt)))
			.orderBy(desc(order.completedAt))
			.limit(10),
		db
			.select({ laborHours: order.laborHours })
			.from(order)
			.where(and(eq(order.engineerId, engineerId), gte(order.completedAt, since))),
	]);

	const hours = lastMonth.reduce((sum, row) => sum + row.laborHours, 0);
	return {
		engineer: found,
		openOrders,
		completedOrders,
		stats: {
			openOrders: openOrders.length,
			hours,
			revenue: lastMonth.reduce((sum, row) => sum + laborCost(row.laborHours, found.hourlyRate), 0),
		},
	};
});

/** Whether another engineer already uses this email address. */
async function emailTaken(email: string, exceptId?: number) {
	const other = await db.query.engineer.findFirst({
		columns: { id: true },
		where: exceptId
			? and(eq(engineer.email, email), ne(engineer.id, exceptId))
			: eq(engineer.email, email),
	});
	return !!other;
}

export const createEngineer = form(v.object(engineerFields), async (input, issue) => {
	requireUser();
	if (await emailTaken(input.email)) {
		invalid(issue.email("Another engineer already uses this email address"));
	}
	const [created] = await db.insert(engineer).values(input).returning({ id: engineer.id });
	void getEngineers().refresh();
	redirect(303, `/engineers/${created.id}`);
});

export const updateEngineer = form(
	v.object({ id: id(), ...engineerFields }),
	async (data, issue) => {
		requireUser();
		const { id, ...input } = data;
		if (
			!(await db.query.engineer.findFirst({ columns: { id: true }, where: eq(engineer.id, id) }))
		) {
			error(404, "Engineer not found");
		}
		if (await emailTaken(input.email, id)) {
			invalid(issue.email("Another engineer already uses this email address"));
		}
		await db.update(engineer).set(input).where(eq(engineer.id, id));
		void getEngineers().refresh();
		void getEngineer(String(id)).refresh();
		redirect(303, `/engineers/${id}`);
	},
);

export const deleteEngineer = form(v.object({ id: id() }), async ({ id }) => {
	requireUser();
	const found = await db.query.engineer.findFirst({ where: eq(engineer.id, id) });
	if (!found) error(404, "Engineer not found");

	const [{ assigned }] = await db
		.select({ assigned: count() })
		.from(order)
		.where(eq(order.engineerId, id));
	if (assigned > 0) {
		const orders = assigned === 1 ? "1 order is" : `${assigned} orders are`;
		invalid(
			`${found.name} can't be deleted while ${orders} assigned to them. To take them off new work, mark them inactive instead.`,
		);
	}

	await deleteOrRefuse(
		() => db.delete(engineer).where(eq(engineer.id, id)),
		"Other records still refer to this engineer. Mark them inactive instead.",
	);
	void getEngineers().refresh();
	redirect(303, "/engineers");
});
