import { command, form, query, requested } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, eq, inArray, type SQL, sql, type SQLWrapper } from "drizzle-orm";
import * as v from "valibot";

import { equipmentStatuses, openOrderStatuses } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { bulkTarget, type BulkTargetInput, forEachRecord, targetIds } from "#lib/server/bulk.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { customer, equipment, order } from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import {
	facetCounts,
	groupCounts,
	nocase,
	oneOf,
	pageGroupsOf,
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
		manufacturer: {
			sort: nocase(equipment.manufacturer),
			filter: oneOf(equipment.manufacturer),
			group: equipment.manufacturer,
		},
		category: {
			sort: equipment.category,
			filter: oneOf(equipment.category),
			group: equipment.category,
		},
		status: { sort: equipment.status, filter: oneOf(equipment.status), group: equipment.status },
		customer: { sort: nocase(customer.name), filter: oneOf(customer.code), group: customer.code },
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
 * A page of the tenant's units with their owner and number of open orders, searched, filtered,
 * sorted and grouped as the URL's parameters say (`equipmentUrl`), how many match in all, and,
 * when grouped, what the table needs to know of the page's groups.
 */
export const getEquipmentList = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(equipmentTable(), params);
	const [fetched, [{ count: rowCount }], counts] = await Promise.all([
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
		groupCounts(plan, countEquipment),
	]);

	// The page's open orders (only).
	const ids = fetched.map((row) => row.id);
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

	const page = plan.page(fetched.map((row) => ({ ...row, openOrders: openOf.get(row.id) ?? 0 })));
	return {
		rows: page.rows,
		rowCount,
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
		groups: pageGroupsOf(counts, page),
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

/**
 * Deletes one of the tenant's units; refuses one that orders (or an optional module's records)
 * refer to. A 404 if there's no such unit. The unit's page and the list's bulk delete share it.
 */
async function removeEquipment(id: number) {
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
}

export const deleteEquipment = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeEquipment(id);
	redirect(303, "/equipment");
});

// --- Bulk actions on the list's selected units (see `bulk-actions.ts`) -------------------------

/** The ids of the tenant's units matching the list's search and filters (`equipmentUrl`). */
async function matchingEquipmentIds(params: string, limit: number) {
	const rows = await db
		.select({ id: equipment.id })
		.from(equipment)
		.innerJoin(customer, and(eq(equipment.customerId, customer.id), inTenant(customer)))
		.where(planTable(equipmentTable(), params).where())
		.orderBy(equipment.id)
		.limit(limit);
	return rows.map((row) => row.id);
}

/** The tenant's units a bulk action acts on (another tenant's ids aren't found). */
async function targetEquipment(target: BulkTargetInput) {
	const ids = await targetIds(target, matchingEquipmentIds);
	const found = await db
		.select({ id: equipment.id, serialNumber: equipment.serialNumber, status: equipment.status })
		.from(equipment)
		.where(and(inArray(equipment.id, ids), inTenant(equipment)))
		.orderBy(equipment.serialNumber);
	return { found, asked: ids.length };
}

/** Refreshes the pages of the list and its filters' counts that the client asked for. */
async function refreshList() {
	await requested(getEquipmentList, 4).refreshAll();
	await requested(getEquipmentFacets, 4).refreshAll();
}

/** Gives the selected units another status, e.g. decommissioned. */
export const bulkSetEquipmentStatus = command(
	v.object({ target: bulkTarget, status: v.picklist(equipmentStatuses) }),
	async ({ target, status }) => {
		requireMember();
		const { found, asked } = await targetEquipment(target);
		const result = await forEachRecord(
			found,
			asked,
			(unit) => unit.serialNumber,
			(unit) =>
				db.transaction(async (tx) => {
					if (unit.status === status) return;
					await tx
						.update(equipment)
						.set({ status })
						.where(and(eq(equipment.id, unit.id), inTenant(equipment)));
					const subject = { type: "equipment", id: unit.id, label: unit.serialNumber };
					await recordActivity(tx, { action: "updated", subject, before: unit, after: { status } });
				}),
		);
		await refreshList();
		return result;
	},
);

/** Deletes the selected units, with the same refusals as deleting one. */
export const bulkDeleteEquipment = command(bulkTarget, async (target) => {
	requireMember();
	const { found, asked } = await targetEquipment(target);
	const result = await forEachRecord(
		found,
		asked,
		(unit) => unit.serialNumber,
		(unit) => removeEquipment(unit.id),
	);
	await refreshList();
	return result;
});
