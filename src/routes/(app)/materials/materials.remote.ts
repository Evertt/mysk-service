import { command, form, query, requested } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	inArray,
	ne,
	type SQL,
	sql,
	type SQLWrapper,
} from "drizzle-orm";
import * as v from "valibot";

import { getSubjectActivity } from "#lib/components/activity/activity.remote.js";
import { label } from "#lib/i18n/labels.js";
import { fitsUnit, isOpenOrder, type MaterialUnit, stockLevels } from "#lib/models.js";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.js";
import { recordActivity } from "#lib/server/activity.js";
import { bulkTarget, forEachRecord, targetIds } from "#lib/server/bulk.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import {
	customer,
	material,
	order,
	orderLine,
	stockMovement,
	user,
} from "#lib/server/db/schema.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { moveStock, roundQuantity, stockLevelSql, withBalances } from "#lib/server/stock.js";
import {
	facetCounts,
	nocase,
	oneOf,
	planTable,
	rank,
	type ServerTable,
	tableParams,
} from "#lib/server/table-query.js";

import {
	countFields,
	materialFields,
	newMaterialFields,
	receiveFields,
} from "./material-schema.js";
import { materialsUrl } from "./materials-url.js";

/** How many different orders of the current tenant use a material. */
const ordersUsing = async (materialId: number) => {
	const [row] = await db
		.select({ count: countDistinct(orderLine.orderId) })
		.from(orderLine)
		.where(and(eq(orderLine.materialId, materialId), inTenant(orderLine)));
	return row.count;
};

/** A material of the current tenant, by id (ids come from the client, so check the tenant). */
const findMaterial = (id: number) =>
	db.query.material.findFirst({ where: and(eq(material.id, id), inTenant(material)) });

/** Whether every stock movement of a material can be counted in `unit` (e.g. whole pieces). */
const historyFits = async (materialId: number, unit: MaterialUnit) => {
	const movements = await db
		.select({ quantity: stockMovement.quantity })
		.from(stockMovement)
		.where(and(eq(stockMovement.materialId, materialId), inTenant(stockMovement)));
	return movements.every((movement) => fitsUnit(movement.quantity, unit));
};

/** The materials list's columns in SQL, for its URL state (`materialsUrl`). */
const materialsTable = (): ServerTable => {
	const level = stockLevelSql(material.stock, material.unit);
	return {
		spec: materialsUrl,
		columns: {
			name: { sort: nocase(material.name) },
			sku: { sort: material.sku },
			unit: { sort: material.unit, filter: oneOf(material.unit) },
			unitPrice: { sort: material.unitPrice },
			stock: { sort: material.stock },
			// From out of stock to in stock rather than alphabetically.
			stockLevel: {
				sort: rank(level, stockLevels),
				filter: (levels) => inArray(level, levels),
			},
			// Counted for every material only to sort by them (the page's own are counted apart).
			orderCount: {
				sort: sql`(select count(distinct ${orderLine.orderId}) from ${orderLine} where ${and(
					inTenant(orderLine),
					eq(orderLine.materialId, material.id),
				)})`,
			},
		},
		search: [material.name, material.sku],
		tieBreaker: material.id,
		scope: () => inTenant(material),
	};
};

/** How many materials match `where`: in all, or per value of `by`. */
function countMaterials(where: SQL | undefined, by?: SQLWrapper) {
	const counted = db
		.select({ value: sql<unknown>`${by ?? sql`null`}`, count: count() })
		.from(material)
		.where(where);
	return by ? counted.groupBy(sql`${by}`) : counted;
}

/**
 * A page of the materials list with the number of orders that use them, searched, filtered and
 * sorted as the URL's parameters say (`materialsUrl`), and how many match in all.
 */
export const getMaterials = query(tableParams, async (params) => {
	requireMember();
	const plan = planTable(materialsTable(), params);
	const [rows, [{ count: rowCount }]] = await Promise.all([
		db
			.select({
				id: material.id,
				sku: material.sku,
				name: material.name,
				unit: material.unit,
				unitPrice: material.unitPrice,
				stock: material.stock,
			})
			.from(material)
			.where(plan.where())
			.orderBy(...plan.orderBy)
			.limit(plan.limit)
			.offset(plan.offset),
		countMaterials(plan.where()),
	]);

	// The page's usage (only).
	const ids = rows.map((row) => row.id);
	const usage = ids.length
		? await db
				.select({ materialId: orderLine.materialId, orders: countDistinct(orderLine.orderId) })
				.from(orderLine)
				.where(and(inTenant(orderLine), inArray(orderLine.materialId, ids)))
				.groupBy(orderLine.materialId)
		: [];
	const usageOf = new Map(usage.map((row) => [row.materialId, row.orders]));

	return {
		rows: rows.map((row) => ({ ...row, orderCount: usageOf.get(row.id) ?? 0 })),
		rowCount,
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
	};
});

/**
 * How many materials have each unit and stock level, for the list's filters: of those matching
 * the search and the other filters in the URL's parameters.
 */
export const getMaterialFacets = query(tableParams, async (params) => {
	requireMember();
	return facetCounts(
		planTable(materialsTable(), params),
		{ unit: material.unit, stockLevel: stockLevelSql(material.stock, material.unit) },
		countMaterials,
	);
});

/**
 * One material with the orders that use it (most recent first), its stock movements (newest first,
 * with the stock after each) and headline numbers.
 */
export const getMaterial = query(v.string(), async (sku) => {
	requireMember();
	const found = await db.query.material.findFirst({
		where: and(eq(material.sku, sku), inTenant(material)),
	});
	if (!found) error(404, m.materials_not_found_sku({ sku }));

	// One row per order, in case an order has several lines for the material.
	const usage = await db
		.select({
			orderId: order.id,
			number: order.number,
			status: order.status,
			createdAt: order.createdAt,
			customer: { code: customer.code, name: customer.name },
			quantity: sql<number>`sum(${orderLine.quantity})`.mapWith(Number),
			// Every line of a material on one order is quoted at the same price.
			unitPrice: sql<number>`max(${orderLine.unitPrice})`.mapWith(Number),
			amount: sql<number>`sum(round(${orderLine.quantity} * ${orderLine.unitPrice}))`.mapWith(
				Number,
			),
		})
		.from(orderLine)
		.innerJoin(order, eq(orderLine.orderId, order.id))
		.innerJoin(customer, eq(order.customerId, customer.id))
		.where(and(eq(orderLine.materialId, found.id), inTenant(order), inTenant(customer)))
		.groupBy(order.id)
		.orderBy(desc(order.createdAt), desc(order.id));

	const movements = await db
		.select({
			id: stockMovement.id,
			kind: stockMovement.kind,
			quantity: stockMovement.quantity,
			note: stockMovement.note,
			createdAt: stockMovement.createdAt,
			// The number stays when the order is deleted; `order` is only there while it exists.
			orderNumber: stockMovement.orderNumber,
			order: { number: order.number },
			user: { name: user.name },
		})
		.from(stockMovement)
		.leftJoin(order, and(eq(stockMovement.orderId, order.id), inTenant(order)))
		.leftJoin(user, eq(stockMovement.userId, user.id))
		.where(and(eq(stockMovement.materialId, found.id), inTenant(stockMovement)))
		.orderBy(desc(stockMovement.createdAt), desc(stockMovement.id));

	const yearAgo = new Date();
	yearAgo.setFullYear(yearAgo.getFullYear() - 1);
	const lastYear = usage.filter((row) => row.createdAt >= yearAgo && row.status !== "cancelled");
	const open = usage.filter((row) => isOpenOrder(row.status));
	const total = (rows: typeof usage) => rows.reduce((sum, row) => sum + row.quantity, 0);

	return {
		material: found,
		usage,
		movements: withBalances(movements, found.stock),
		stats: {
			usedLastYear: total(lastYear),
			openOrders: open.length,
			neededForOpenOrders: total(open),
		},
	};
});

/** Another material of the current tenant with the same name (ignoring case), if any. */
const sameName = (name: string, exceptId?: number) =>
	db.query.material.findFirst({
		columns: { sku: true },
		where: and(
			inTenant(material),
			sql`lower(${material.name}) = lower(${name})`,
			exceptId ? ne(material.id, exceptId) : undefined,
		),
	});

export const createMaterial = form(v.object(newMaterialFields), async (input, issue) => {
	const { organizationId } = requireMember();
	const problems = [];
	const duplicate = await sameName(input.name);
	if (duplicate) problems.push(issue.name(m.materials_name_taken({ sku: duplicate.sku })));
	if (!fitsUnit(input.stock, input.unit)) problems.push(issue.stock(m.materials_whole_pieces()));
	if (problems.length) invalid(...problems);

	const { stock, ...fields } = input;
	const sku = await db.transaction(async (tx) => {
		// SKUs are sequential per tenant: one more than the tenant's highest (MAT-0001 for the first).
		const [{ last }] = await tx
			.select({ last: sql<number | null>`max(cast(substr(${material.sku}, 5) as integer))` })
			.from(material)
			.where(inTenant(material));
		const sku = `MAT-${String((last ?? 0) + 1).padStart(4, "0")}`;
		const [created] = await tx
			.insert(material)
			.values({ ...fields, organizationId, sku, stock: 0 })
			.returning({ id: material.id });
		// The stock it starts with is its first movement.
		await moveStock(tx, { materialId: created.id, quantity: stock, kind: "opening_balance" });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "material", id: created.id, label: sku },
		});
		return sku;
	});
	redirect(303, `/materials/${sku}`);
});

export const updateMaterial = form(
	v.object({ id: id(), ...materialFields }),
	async (data, issue) => {
		requireMember();
		const { id, ...input } = data;
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());

		const problems = [];
		const duplicate = await sameName(input.name, id);
		if (duplicate) problems.push(issue.name(m.materials_name_taken({ sku: duplicate.sku })));
		// Order lines are counted in the material's unit, so changing it would change them too.
		if (input.unit !== existing.unit) {
			const orders = await ordersUsing(id);
			if (orders) {
				problems.push(
					issue.unit(
						m.materials_unit_in_use({
							count: orders,
							unit: label("materialUnitSymbol", existing.unit),
						}),
					),
				);
			} else if (!(await historyFits(id, input.unit))) {
				// Its stock movements are counted in the new unit from now on.
				problems.push(issue.unit(m.materials_unit_history_parts()));
			}
		}
		if (problems.length) invalid(...problems);

		await db.transaction(async (tx) => {
			await tx
				.update(material)
				.set(input)
				.where(and(eq(material.id, id), inTenant(material)));
			const subject = { type: "material", id, label: existing.sku };
			await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
		});
		// Send the updated material along, so the page we redirect to doesn't show the old one first.
		void getMaterial(existing.sku).refresh();
		redirect(303, `/materials/${existing.sku}`);
	},
);

/**
 * Deletes one of the tenant's materials with its stock history; refuses one that orders use (or
 * other records refer to). A 404 if there's no such material. The material's page and the list's
 * bulk delete share it.
 */
async function removeMaterial(id: number) {
	const existing = await findMaterial(id);
	if (!existing) error(404, m.materials_not_found());
	const orders = await ordersUsing(id);
	if (orders) {
		invalid(m.materials_delete_in_use({ count: orders }));
	}
	await refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(material).where(and(eq(material.id, id), inTenant(material)));
				const subject = { type: "material", id, label: existing.sku };
				await recordActivity(tx, { action: "deleted", subject });
			}),
		m.materials_delete_referenced(),
	);
}

export const deleteMaterial = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeMaterial(id);
	redirect(303, "/materials");
});

/** The ids of the tenant's materials matching the list's search and filters (`materialsUrl`). */
async function matchingMaterialIds(params: string, limit: number) {
	const rows = await db
		.select({ id: material.id })
		.from(material)
		.where(planTable(materialsTable(), params).where())
		.orderBy(material.id)
		.limit(limit);
	return rows.map((row) => row.id);
}

/** Deletes the selected materials, with the same refusals as deleting one. */
export const bulkDeleteMaterials = command(bulkTarget, async (target) => {
	requireMember();
	const ids = await targetIds(target, matchingMaterialIds);
	const found = await db
		.select({ id: material.id, sku: material.sku })
		.from(material)
		.where(and(inArray(material.id, ids), inTenant(material)))
		.orderBy(material.sku);
	const result = await forEachRecord(
		found,
		ids.length,
		(each) => each.sku,
		(each) => removeMaterial(each.id),
	);
	await requested(getMaterials, 4).refreshAll();
	await requested(getMaterialFacets, 4).refreshAll();
	return result;
});

/** Adds received stock (e.g. a delivery) to a material. */
export const receiveStock = form(
	v.object({ id: id(), ...receiveFields }),
	async ({ id, quantity, note }, issue) => {
		requireMember();
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());
		if (!fitsUnit(quantity, existing.unit)) invalid(issue.quantity(m.materials_whole_pieces()));

		await db.transaction(async (tx) => {
			const { stock } = await moveStock(tx, { materialId: id, quantity, kind: "receipt", note });
			const subject = { type: "material", id, label: existing.sku };
			const before = { stock: roundQuantity(stock - quantity) };
			await recordActivity(tx, {
				action: "stock_received",
				subject,
				before,
				after: { stock },
				note,
			});
		});
		void getMaterial(existing.sku).refresh();
		void getSubjectActivity({ type: "material", id: String(id) }).refresh();
	},
);

/** Sets a material's stock to what was counted, recording the difference as an adjustment. */
export const countStock = form(
	v.object({ id: id(), ...countFields }),
	async ({ id, counted, note }, issue) => {
		requireMember();
		const existing = await findMaterial(id);
		if (!existing) error(404, m.materials_not_found());
		if (!fitsUnit(counted, existing.unit)) invalid(issue.counted(m.materials_whole_pieces()));

		await db.transaction(async (tx) => {
			// The difference with the stock as it is now, inside the transaction, so that the stock
			// ends up as counted even if it changed since the form was opened.
			const [current] = await tx
				.select({ stock: material.stock })
				.from(material)
				.where(and(eq(material.id, id), inTenant(material)));
			const difference = roundQuantity(counted - current.stock);
			if (!difference) invalid(issue.counted(m.materials_count_unchanged()));
			await moveStock(tx, { materialId: id, quantity: difference, kind: "adjustment", note });
			const subject = { type: "material", id, label: existing.sku };
			const [before, after] = [{ stock: current.stock }, { stock: counted }];
			await recordActivity(tx, { action: "stock_adjusted", subject, before, after, note });
		});
		void getMaterial(existing.sku).refresh();
		void getSubjectActivity({ type: "material", id: String(id) }).refresh();
	},
);
