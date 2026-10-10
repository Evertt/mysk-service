import { and, countDistinct, inArray } from "drizzle-orm";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { stockLevelSql } from "#lib/materials/server";
import { removeMaterial } from "#lib/materials/server/materials.ts";
import { inTenant } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { material, orderLine } from "#lib/server/db/schema.ts";
import {
	bulkChange,
	listTarget,
	refreshRequested,
	pageGroupsOf,
	planList,
} from "#lib/server/lists";
import { forMembers } from "#lib/server/remote-functions.ts";

import { materialsSql } from "./material-list.server.ts";
import { materialsList } from "./materials-list.ts";

/**
 * A page of the materials list with the number of orders that use them, searched, filtered and
 * sorted as the query says (see `materialsList`), and how many match in all.
 */
export const getMaterials = forMembers.query(materialsList.query, async (input) => {
	const plan = planList(materialsSql(), input);
	const [rows, rowCount, counts] = await Promise.all([
		plan.paged(
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
				.$dynamic(),
		),
		plan.count(),
		plan.groupCounts(),
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
		/** The query the rows are for (its `where` is the target of "select all matching"). */
		query: input,
		/** The same as a string, to tell whether the table is waiting for other rows (`isStale`). */
		key: queryKey(input),
		groups: pageGroupsOf(counts, page),
	};
});

/**
 * How many materials have each unit and stock level, for the counts in the list's filters: of
 * those matching the search and the other filters.
 */
export const getMaterialFacets = forMembers.query(materialsList.where, async (where) => {
	return planList(materialsSql(), where).facets({
		unit: material.unit,
		stockLevel: stockLevelSql(material.stock, material.unit),
	});
});

/** Deletes the selected materials, with the same refusals as deleting one. */
export const bulkDeleteMaterials = forMembers.command(
	listTarget(materialsList.where),
	async (target) => {
		const result = await bulkChange(target, {
			table: material,
			label: material.sku,
			list: materialsSql,
			change: (each) => removeMaterial(each.id),
		});
		await refreshRequested(getMaterials, getMaterialFacets);
		return result;
	},
);
