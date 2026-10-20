import { and, countDistinct } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { bulkChange, listTarget, refreshRequested, planList } from "#lib/server/lists/index.ts";

import { command, query } from "../remote-functions.ts";
import { materialsSql } from "../server/list-sql.ts";
import { removeMaterial } from "../server/materials.ts";
import { material, orderLine } from "../server/schema.ts";
import { stockLevelSql } from "../server/stock.ts";
import { materialsList } from "./materials-list.ts";

/**
 * A page of the materials list with the number of orders that use them, searched, filtered and
 * sorted as the query says (see `materialsList`), and how many match in all.
 */
export const getMaterials = query(materialsList.query, (input) =>
	planList(materialsSql(), input).answer(
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
		{
			// The page's usage (only).
			enrich: async (rows) => {
				const ids = rows.map((row) => row.id);
				const usage = ids.length
					? await db
							.select({
								materialId: orderLine.materialId,
								orders: countDistinct(orderLine.orderId),
							})
							.from(orderLine)
							.where(and(inTenant(orderLine), inList(orderLine.materialId, ids)))
							.groupBy(orderLine.materialId)
					: [];
				const usageOf = new Map(usage.map((row) => [row.materialId, row.orders]));
				return rows.map((row) => ({ ...row, orderCount: usageOf.get(row.id) ?? 0 }));
			},
		},
	),
);

/**
 * How many materials have each unit and stock level, for the counts in the list's filters: of
 * those matching the search and the other filters.
 */
export const getMaterialFacets = query(materialsList.where, async (where) => {
	return planList(materialsSql(), where).facets({
		unit: material.unit,
		stockLevel: stockLevelSql(material.stock, material.unit),
	});
});

/** Deletes the selected materials, with the same refusals as deleting one. */
export const bulkDeleteMaterials = command(listTarget(materialsList.where), async (target) => {
	const result = await bulkChange(target, {
		table: material,
		label: material.sku,
		list: materialsSql,
		change: (each) => removeMaterial(each.id),
	});
	await refreshRequested(getMaterials, getMaterialFacets);
	return result;
});
