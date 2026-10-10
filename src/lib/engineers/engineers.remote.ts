import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { DAY } from "#lib/dates.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { laborCost } from "#lib/orders/server";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { bulkChange, idsTarget } from "#lib/server/lists";
import { deleteAndLog } from "#lib/server/records.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { engineerFields } from "./form/engineer-schema.ts";

/** The tenant's engineers with the number of open orders assigned to them, by name. */
export const getEngineers = forMembers.query(async () => {
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
export const getEngineer = forMembers.query(v.string(), async (param) => {
	const engineerId = parseId(param);
	const found = await db.query.engineer.findFirst({ where: idInTenant(engineer, engineerId) });
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
			.innerJoin(...tenantJoin(customer, order.customerId))
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
			.innerJoin(...tenantJoin(customer, order.customerId))
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

/** The form problem of an email address another engineer uses, if there is one. */
async function emailProblems(email: string, exceptId?: number): Promise<Problem<"email">[]> {
	if (!(await emailTaken(email, exceptId))) return [];
	return [{ field: "email", message: m.engineers_email_taken() }];
}

export const createEngineer = forMembers.form(v.object(engineerFields), async (input, issue) => {
	const { organizationId } = currentTenant();
	refuse(issue, await emailProblems(input.email));
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

export const updateEngineer = forMembers.form(
	v.object({ id: id(), ...engineerFields }),
	async (data, issue) => {
		const { id, ...input } = data;
		const found = await db.query.engineer.findFirst({ where: idInTenant(engineer, id) });
		if (!found) error(404, m.engineers_not_found());
		refuse(issue, await emailProblems(input.email, id));
		await db.transaction(async (tx) => {
			await tx.update(engineer).set(input).where(idInTenant(engineer, id));
			const subject = { type: "engineer", id, label: input.name };
			await recordActivity(tx, { action: "updated", subject, before: found, after: input });
		});
		void getEngineers().refresh();
		void getEngineer(String(id)).refresh();
		redirect(303, `/engineers/${id}`);
	},
);

/**
 * Marks the selected engineers active or inactive, as their form's "Active" box does: only active
 * engineers can be assigned new orders; what's assigned to them stays.
 */
export const bulkSetEngineersActive = forMembers.command(
	v.object({ target: idsTarget, active: v.boolean() }),
	async ({ target, active }) => {
		const result = await bulkChange(target, {
			table: engineer,
			label: engineer.name,
			columns: { active: engineer.active },
			change: (each) =>
				db.transaction(async (tx) => {
					if (each.active === active) return;
					await tx.update(engineer).set({ active }).where(idInTenant(engineer, each.id));
					const subject = { type: "engineer", id: each.id, label: each.label };
					await recordActivity(tx, { action: "updated", subject, before: each, after: { active } });
				}),
		});
		void getEngineers().refresh();
		return result;
	},
);

/**
 * Deletes one of the tenant's engineers; refuses one with orders assigned (or other records
 * referring to it). A 404 if there's no such engineer.
 */
async function removeEngineer(id: number) {
	const found = await db.query.engineer.findFirst({
		columns: { id: true, name: true },
		where: idInTenant(engineer, id),
	});
	if (!found) error(404, m.engineers_not_found());

	const [{ assigned }] = await db
		.select({ assigned: count() })
		.from(order)
		.where(and(inTenant(order), eq(order.engineerId, id)));
	if (assigned > 0) {
		invalid(m.engineers_delete_refused({ name: found.name, count: assigned }));
	}

	await deleteAndLog(
		engineer,
		{ type: "engineer", id, label: found.name },
		m.engineers_delete_referenced(),
	);
}

export const deleteEngineer = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeEngineer(id);
	void getEngineers().refresh();
	redirect(303, "/engineers");
});
