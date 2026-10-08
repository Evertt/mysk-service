import { command, query, requested } from "$app/server";
import {
	and,
	count,
	countDistinct,
	eq,
	inArray,
	type SQL,
	sql,
	type SQLWrapper,
} from "drizzle-orm";

import { stockLevels } from "#lib/models.js";
import { bulkTarget, forEachRecord, targetIds } from "#lib/server/bulk.js";
import { db } from "#lib/server/db/index.js";
import { material, orderLine } from "#lib/server/db/schema.js";
import { removeMaterial } from "#lib/server/materials.js";
import { inTenant, requireMember } from "#lib/server/session.js";
import { stockLevelSql } from "#lib/server/stock.js";
import {
	facetCounts,
	groupCounts,
	nocase,
	oneOf,
	pageGroupsOf,
	planTable,
	rank,
	type ServerTable,
	tableParams,
} from "#lib/server/table-query.js";

import { materialsUrl } from "./materials-url.js";

/** The materials list's columns in SQL, for its URL state (`materialsUrl`). */
const materialsTable = (): ServerTable => {
	const level = stockLevelSql(material.stock, material.unit);
	return {
		spec: materialsUrl,
		columns: {
			name: { sort: nocase(material.name) },
			sku: { sort: material.sku },
			unit: { sort: material.unit, filter: oneOf(material.unit), group: material.unit },
			unitPrice: { sort: material.unitPrice },
			stock: { sort: material.stock },
			// From out of stock to in stock rather than alphabetically.
			stockLevel: {
				sort: rank(level, stockLevels),
				filter: (levels) => inArray(level, levels),
				group: level,
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
	const [rows, [{ count: rowCount }], counts] = await Promise.all([
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
		groupCounts(plan, countMaterials),
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

	const page = plan.page(rows.map((row) => ({ ...row, orderCount: usageOf.get(row.id) ?? 0 })));
	return {
		rows: page.rows,
		rowCount,
		/** The state the rows are for (see `isStale`). */
		key: plan.key,
		groups: pageGroupsOf(counts, page),
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
