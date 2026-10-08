import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { openOrderStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, engineer, order } from "#lib/server/db/schema.js";
import { laborCost } from "#lib/server/pricing.js";
import { inTenant, requireMember } from "#lib/server/session.js";

import { engineerFields } from "./engineer-schema.js";

const DAY = 24 * 60 * 60 * 1000;

/** The tenant's engineers with the number of open orders assigned to them, by name. */
export const getEngineers = query(async () => {
	requireMember();
	const open = db
		.select({ engineerId: order.engineerId, count: count().as("open_count") })
		.from(order)
		.where(and(inTenant(order), inArray(order.status, openOrderStatuses)))
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
		.where(inTenant(engineer))
		.orderBy(asc(engineer.name));
});

/** Parses an id from the URL, or a 404. Ids are global: look them up with `inTenant(engineer)`. */
function parseId(value: string) {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1)
		error(404, m.engineers_id_not_found({ id: value }));
	return parsed;
}

/** One of the tenant's engineers with their open and recent orders and last month's numbers. */
export const getEngineer = query(v.string(), async (param) => {
	requireMember();
	const engineerId = parseId(param);
	const found = await db.query.engineer.findFirst({
		where: and(eq(engineer.id, engineerId), inTenant(engineer)),
	});
	if (!found) error(404, m.engineers_id_not_found({ id: param }));

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
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
			.where(
				and(
					inTenant(order),
					eq(order.engineerId, engineerId),
					inArray(order.status, openOrderStatuses),
				),
			)
			.orderBy(sql`${order.scheduledFor} is null`, asc(order.scheduledFor), asc(order.id)),
		db
			.select(columns)
			.from(order)
			.innerJoin(customer, and(eq(order.customerId, customer.id), inTenant(customer)))
			.where(and(inTenant(order), eq(order.engineerId, engineerId), isNotNull(order.completedAt)))
			.orderBy(desc(order.completedAt))
			.limit(10),
		db
			.select({ laborHours: order.laborHours })
			.from(order)
			.where(and(inTenant(order), eq(order.engineerId, engineerId), gte(order.completedAt, since))),
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

/** Whether another of the tenant's engineers already uses this email address. */
async function emailTaken(email: string, exceptId?: number) {
	const other = await db.query.engineer.findFirst({
		columns: { id: true },
		where: and(
			inTenant(engineer),
			eq(engineer.email, email),
			exceptId ? ne(engineer.id, exceptId) : undefined,
		),
	});
	return !!other;
}

export const createEngineer = form(v.object(engineerFields), async (input, issue) => {
	const { organizationId } = requireMember();
	if (await emailTaken(input.email)) {
		invalid(issue.email(m.engineers_email_taken()));
	}
	const created = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(engineer)
			.values({ ...input, organizationId })
			.returning({ id: engineer.id });
		const subject = { type: "engineer", id: created.id, label: input.name };
		await recordActivity(tx, { action: "created", subject });
		return created;
	});
	void getEngineers().refresh();
	redirect(303, `/engineers/${created.id}`);
});

export const updateEngineer = form(
	v.object({ id: id(), ...engineerFields }),
	async (data, issue) => {
		requireMember();
		const { id, ...input } = data;
		const found = await db.query.engineer.findFirst({
			where: and(eq(engineer.id, id), inTenant(engineer)),
		});
		if (!found) error(404, m.engineers_not_found());
		if (await emailTaken(input.email, id)) {
			invalid(issue.email(m.engineers_email_taken()));
		}
		await db.transaction(async (tx) => {
			await tx
				.update(engineer)
				.set(input)
				.where(and(eq(engineer.id, id), inTenant(engineer)));
			const subject = { type: "engineer", id, label: input.name };
			await recordActivity(tx, { action: "updated", subject, before: found, after: input });
		});
		void getEngineers().refresh();
		void getEngineer(String(id)).refresh();
		redirect(303, `/engineers/${id}`);
	},
);

export const deleteEngineer = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	const found = await db.query.engineer.findFirst({
		where: and(eq(engineer.id, id), inTenant(engineer)),
	});
	if (!found) error(404, m.engineers_not_found());

	const [{ assigned }] = await db
		.select({ assigned: count() })
		.from(order)
		.where(and(inTenant(order), eq(order.engineerId, id)));
	if (assigned > 0) {
		invalid(m.engineers_delete_refused({ name: found.name, count: assigned }));
	}

	await refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(engineer).where(and(eq(engineer.id, id), inTenant(engineer)));
				const subject = { type: "engineer", id, label: found.name };
				await recordActivity(tx, { action: "deleted", subject });
			}),
		m.engineers_delete_referenced(),
	);
	void getEngineers().refresh();
	redirect(303, "/engineers");
});
