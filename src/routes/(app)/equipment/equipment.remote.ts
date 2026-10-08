import { form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import { openOrderStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import {
	facetCounts,
	nocase,
	oneOf,
	planTable,
	type ServerTable,
	tableParams,
} from "#lib/server/table-query.js";

import { equipmentFields } from "./equipment-schema.js";
import { equipmentUrl } from "./equipment-url.js";

/** The equipment list's columns in SQL, for its URL state (`equipmentUrl`). */
const equipmentTable = (): ServerTable => ({
	spec: equipmentUrl,
	columns: {
		unit: { sort: [nocase(equipment.manufacturer), nocase(equipment.model)] },
		serialNumber: { sort: equipment.serialNumber },
		manufacturer: { sort: nocase(equipment.manufacturer), filter: oneOf(equipment.manufacturer) },
		category: { sort: equipment.category, filter: oneOf(equipment.category) },
		status: { sort: equipment.status, filter: oneOf(equipment.status) },
		customer: { sort: nocase(customer.name), filter: oneOf(customer.code) },
		installedAt: { sort: equipment.installedAt },
		warrantyUntil: { sort: equipment.warrantyUntil },
		// Counted for every unit only to sort by them (the page's own are counted apart).
		openOrders: {
			sort: sql`(select count(*) from ${order} where ${and(
				inTenant(order),
				eq(order.equipmentId, equipment.id),
				inArray(order.status, openOrderStatuses),
			)})`,
		},
	},
	search: [
		equipment.serialNumber,
		equipment.manufacturer,
		equipment.model,
		customer.name,
		customer.code,
	],
	tieBreaker: equipment.id,
	scope: () => inTenant(equipment),
});

/** How many units match `where` (with their owner, as in the list): in all, or per value of `by`. */
function countEquipment(where: SQL | undefined, by?: SQLWrapper) {
	const counted = db
		.select({ value: sql<unknown>`${by ?? sql`null`}`, count: count() })
		.from(equipment)
		.innerJoin(customer, and(eq(equipment.customerId, customer.id), inTenant(customer)))
		.where(where);
	return by ? counted.groupBy(sql`${by}`) : counted;
}

/**
 * A page of the tenant's units with their owner and number of open orders, searched, filtered
 * and sorted as the URL's parameters say (`equipmentUrl`), and how many match in all.
 */
export const getEquipmentList = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(equipmentTable(), params);
	const [rows, [{ count: rowCount }]] = await Promise.all([
		db
			.select({
				id: equipment.id,
				serialNumber: equipment.serialNumber,
				manufacturer: equipment.manufacturer,
				model: equipment.model,
				category: equipment.category,
				status: equipment.status,
				installedAt: equipment.installedAt,
				warrantyUntil: equipment.warrantyUntil,
				customer: { id: customer.id, code: customer.code, name: customer.name },
			})
			.from(equipment)
			.innerJoin(customer, and(eq(equipment.customerId, customer.id), inTenant(customer)))
			.where(plan.where())
			.orderBy(...plan.orderBy)
			.limit(plan.limit)
			.offset(plan.offset),
		countEquipment(plan.where()),
	]);

	// The page's open orders (only).
	const ids = rows.map((row) => row.id);
	const open = ids.length
		? await db
				.select({ equipmentId: order.equipmentId, count: count() })
				.from(order)
				.where(
					and(
						inTenant(order),
						inArray(order.equipmentId, ids),
						inArray(order.status, openOrderStatuses),
					),
				)
				.groupBy(order.equipmentId)
		: [];
	const openOf = new Map(open.map((row) => [row.equipmentId, row.count]));

	return {
		rows: rows.map((row) => ({ ...row, openOrders: openOf.get(row.id) ?? 0 })),
		rowCount,
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
	};
});

/**
 * How many units have each category, status and manufacturer, for the list's filters: of those
 * matching the search and the other filters in the URL's parameters.
 */
export const getEquipmentFacets = query(tableParams, async (params) => {
	requireMember();
	return facetCounts(
		planTable(equipmentTable(), params),
		{
			category: equipment.category,
			status: equipment.status,
			manufacturer: equipment.manufacturer,
		},
		countEquipment,
	);
});

/**
 * One of the tenant's units with its owner, and how many orders it has (which keep it from being
 * moved). Its service history is `getServiceHistory` (`[serial]/service-history.remote.ts`).
 */
export const getEquipment = query(v.string(), async (serialNumber) => {
	requireMember();
	const unit = await db.query.equipment.findFirst({
		where: and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)),
		with: { customer: true },
	});
	if (!unit) error(404, m.equipment_serial_not_found({ serial: serialNumber }));

	const [{ orderCount }] = await db
		.select({ orderCount: count() })
		.from(order)
		.where(and(eq(order.equipmentId, unit.id), inTenant(order)));
	return { unit, orderCount };
});

/** Everything the equipment form needs to choose from (the tenant's customers). */
export const getEquipmentFormOptions = query(async () => {
	requireMember();
	const customers = await db
		.select({ id: customer.id, code: customer.code, name: customer.name })
		.from(customer)
		.where(inTenant(customer))
		.orderBy(asc(customer.name));
	return { customers };
});

type EquipmentInput = v.InferOutput<v.ObjectSchema<typeof equipmentFields, undefined>>;
type Problem = {
	field: "serialNumber" | "customerId" | "warrantyUntil";
	message: string;
};

/**
 * Checks what the schema can't: a serial number unique within the tenant, a customer of the
 * tenant, and not moving a unit with orders. `existing` must already be checked to be in the tenant.
 */
async function checkUnit(
	existing: typeof equipment.$inferSelect | undefined,
	input: EquipmentInput,
): Promise<Problem[]> {
	const problems: Problem[] = [];
	const sameSerial = await db.query.equipment.findFirst({
		columns: { id: true },
		where: and(eq(equipment.serialNumber, input.serialNumber), inTenant(equipment)),
	});
	if (sameSerial && sameSerial.id !== existing?.id) {
		problems.push({
			field: "serialNumber",
			message: m.equipment_serial_taken(),
		});
	}
	const owner = await db.query.customer.findFirst({
		columns: { id: true },
		where: and(eq(customer.id, input.customerId), inTenant(customer)),
	});
	if (!owner) {
		problems.push({ field: "customerId", message: m.equipment_customer_unknown() });
	} else if (existing && existing.customerId !== input.customerId) {
		const [{ total }] = await db
			.select({ total: count() })
			.from(order)
			.where(and(eq(order.equipmentId, existing.id), inTenant(order)));
		if (total) {
			problems.push({
				field: "customerId",
				message: m.equipment_move_refused({ count: total }),
			});
		}
	}
	if (input.warrantyUntil < input.installedAt) {
		problems.push({
			field: "warrantyUntil",
			message: m.equipment_warranty_before_installed(),
		});
	}
	return problems;
}

export const createEquipment = form(v.object(equipmentFields), async (input, issue) => {
	const { organizationId } = requireMember();
	const problems = await checkUnit(undefined, input);
	if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
	await db.transaction(async (tx) => {
		const [created] = await tx
			.insert(equipment)
			.values({ ...input, organizationId })
			.returning({ id: equipment.id });
		const subject = { type: "equipment", id: created.id, label: input.serialNumber };
		await recordActivity(tx, { action: "created", subject });
	});
	redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
});

export const updateEquipment = form(
	v.object({ id: id(), ...equipmentFields }),
	async (data, issue) => {
		requireMember();
		const { id, ...input } = data;
		const existing = await db.query.equipment.findFirst({
			where: and(eq(equipment.id, id), inTenant(equipment)),
		});
		if (!existing) error(404, m.equipment_not_found());
		const problems = await checkUnit(existing, input);
		if (problems.length) invalid(...problems.map((p) => issue[p.field](p.message)));
		// Records of optional modules (e.g. a service contract covering it) belong to the unit's
		// current customer too; the database refuses the move while they exist.
		await refuseIfReferenced(
			() =>
				db.transaction(async (tx) => {
					await tx
						.update(equipment)
						.set(input)
						.where(and(eq(equipment.id, id), inTenant(equipment)));
					const subject = { type: "equipment", id, label: input.serialNumber };
					await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
				}),
			issue.customerId(m.equipment_move_refused_records()),
		);
		void getEquipment(input.serialNumber).refresh();
		redirect(303, `/equipment/${encodeURIComponent(input.serialNumber)}`);
	},
);

export const deleteEquipment = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	const existing = await db.query.equipment.findFirst({
		columns: { id: true, serialNumber: true },
		where: and(eq(equipment.id, id), inTenant(equipment)),
	});
	if (!existing) error(404, m.equipment_not_found());
	const [{ total }] = await db
		.select({ total: count() })
		.from(order)
		.where(and(eq(order.equipmentId, id), inTenant(order)));
	if (total) {
		invalid(m.equipment_delete_refused({ count: total }));
	}
	await refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(equipment).where(and(eq(equipment.id, id), inTenant(equipment)));
				const subject = { type: "equipment", id, label: existing.serialNumber };
				await recordActivity(tx, { action: "deleted", subject });
			}),
		m.equipment_delete_referenced(),
	);
	redirect(303, "/equipment");
});
