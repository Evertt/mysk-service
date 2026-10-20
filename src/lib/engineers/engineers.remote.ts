import { error, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, gte, isNotNull, lt, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { getTimeZone } from "#lib/dates.ts";
import { doneOrderStatuses, openOrderStatuses } from "#lib/models.ts";
import { laborCost } from "#lib/orders/server/index.ts";
import { id, recordId } from "#lib/schema.ts";
import { recordActivity, type Subject } from "#lib/server/activity/index.ts";
import {
	currentTenant,
	idInTenant,
	idsInTenant,
	inTenant,
	tenantJoin,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, order } from "#lib/server/db/schema.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";
import { Refused } from "#lib/server/refused.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { engineerFields } from "./form/engineer-schema.ts";
import { removeEngineer } from "./server/engineers.ts";

/** The tenant's engineers with the number of open orders assigned to them, by name. */
export const getEngineers = forMembers.query(async () => {
	const open = db
		.select({ engineerId: order.engineerId, count: count().as("open_count") })
		.from(order)
		.where(and(inTenant(order), inList(order.status, openOrderStatuses)))
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

/** Orders an engineer has on their plate: accepted, and not cancelled. */
const workStatuses = [...openOrderStatuses, ...doneOrderStatuses];

/**
 * Engineers by id (as the URL has it), each with how many open orders they have and how many are
 * planned for today (in the user's time zone): what their page shows of them, and their hover card
 * (`EngineerLink`). A batch query, so the cards of a page's links come in one request, and a hover
 * card and the page share their answer. An unknown id (or another tenant's) is a 404 for that one.
 * Their orders and last month's numbers are `getEngineerWork`.
 */
export const getEngineer = forMembers.query.batch(v.string(), async (params) => {
	const ids = params.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
	const found = ids.length
		? await db.query.engineer.findMany({ where: idsInTenant(engineer, ids) })
		: [];
	const zone = getTimeZone();
	const today = Temporal.Now.plainDateISO(zone);
	const [start, end] = [today, today.add({ days: 1 })].map((day) =>
		day.toZonedDateTime(zone).toInstant(),
	);
	const counts = found.length
		? await db
				.select({
					engineerId: order.engineerId,
					openOrders: sql<number>`coalesce(sum(${inList(order.status, openOrderStatuses)}), 0)`,
					today: sql<number>`coalesce(sum(${and(
						gte(order.scheduledFor, start),
						lt(order.scheduledFor, end),
					)}), 0)`,
				})
				.from(order)
				.where(
					and(
						inList(
							order.engineerId,
							found.map((one) => one.id),
						),
						inList(order.status, workStatuses),
						inTenant(order),
					),
				)
				.groupBy(order.engineerId)
		: [];
	const byId = new Map(found.map((one) => [one.id, one]));
	const countsOf = new Map(counts.map((row) => [row.engineerId, row]));

	return (param: string) => {
		const one = byId.get(Number(param));
		if (!one) error(404, m.engineers_id_not_found({ id: param }));
		const counted = countsOf.get(one.id);
		return {
			engineer: one,
			counts: {
				openOrders: Number(counted?.openOrders ?? 0),
				today: Number(counted?.today ?? 0),
			},
		};
	};
});

/** One of the tenant's engineers' open and recent orders and last month's numbers, for their page. */
export const getEngineerWork = forMembers.query(v.string(), async (param) => {
	const engineerId = parseId(param);
	const found = await db.query.engineer.findFirst({
		where: idInTenant(engineer, engineerId),
		columns: { hourlyRate: true },
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
	const since = Temporal.Now.instant().subtract({ hours: 30 * 24 });

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
					inList(order.status, openOrderStatuses),
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

/** Refuses an email address another engineer uses, on the form's `email` field. */
async function refuseTakenEmail(email: string, exceptId?: number) {
	if (await emailTaken(email, exceptId)) {
		throw new Refused({ path: ["email"], message: m.engineers_email_taken() });
	}
}

export const createEngineer = forMembers.form(v.object(engineerFields), async (input) => {
	const { organizationId } = currentTenant();
	await refuseTakenEmail(input.email);
	const created = await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(engineer)
			.values({ ...input, organizationId })
			.returning({ id: engineer.id });
		const subject: Subject = { type: "engineer", id: created.id, label: input.name };
		await recordActivity(tx, { action: "created", subject });
		return created;
	});
	void getEngineers().refresh();
	redirect(303, `/engineers/${created.id}`);
});

export const updateEngineer = forMembers.form(
	v.object({ id: id(), ...engineerFields }),
	async (data) => {
		const { id, ...input } = data;
		const found = await db.query.engineer.findFirst({ where: idInTenant(engineer, id) });
		if (!found) error(404, m.engineers_not_found());
		await refuseTakenEmail(input.email, id);
		await db.transaction(async (tx) => {
			await tx.update(engineer).set(input).where(idInTenant(engineer, id));
			const subject: Subject = { type: "engineer", id, label: input.name };
			await recordActivity(tx, { action: "updated", subject, before: found, after: input });
		});
		void getEngineers().refresh();
		void getEngineer(String(id)).refresh();
		// Their revenue is priced at their rate.
		void getEngineerWork(String(id)).refresh();
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
			change: (each) => setActive(each, active),
		});
		void getEngineers().refresh();
		return result;
	},
);

/** Marks one of the tenant's engineers (as loaded) active or inactive, and logs it. */
async function setActive(found: { id: number; label: string; active: boolean }, active: boolean) {
	await db.transaction(async (tx) => {
		if (found.active === active) return;
		await tx.update(engineer).set({ active }).where(idInTenant(engineer, found.id));
		const subject: Subject = { type: "engineer", id: found.id, label: found.label };
		await recordActivity(tx, { action: "updated", subject, before: found, after: { active } });
	});
}

/**
 * Marks one of the tenant's engineers active or inactive, from the status in the engineers list
 * (see `bulkSetEngineersActive`). A 404 if there's no such engineer.
 */
export const setEngineerActive = forMembers.command(
	v.object({ id: recordId(), active: v.boolean() }),
	async ({ id, active }) => {
		const found = await db.query.engineer.findFirst({
			columns: { id: true, name: true, active: true },
			where: idInTenant(engineer, id),
		});
		if (!found) error(404, m.engineers_not_found());
		await setActive({ id: found.id, label: found.name, active: found.active }, active);
		void getEngineers().refresh();
	},
);

export const deleteEngineer = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeEngineer(id);
	void getEngineers().refresh();
	redirect(303, "/engineers");
});
