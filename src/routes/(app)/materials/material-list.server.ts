/**
 * The materials list in SQL, shared by its queries and the bulk command that acts on the materials
 * matching its filters (both in `material-list.remote.ts`). A remote file can only export remote
 * functions, so it can't be shared from there.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { stockLevelSql } from "#lib/materials/server/stock.ts";
import { stockLevels } from "#lib/models.ts";
import { inTenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { material, orderLine } from "#lib/server/db/schema.ts";
import { type ListSql, nocase, rank } from "#lib/server/lists/plan.ts";

import { materialsList } from "./materials-list.ts";

/**
 * The materials list's columns in SQL, checked against its definition (`materialsList`). Call it
 * for each request, not at module scope: `inTenant()` reads the request.
 */
export const materialsSql = (): ListSql<typeof materialsList.columns> => {
	const level = stockLevelSql(material.stock, material.unit);
	return {
		list: materialsList,
		// No joins: the usage is counted in a subquery, to sort by it.
		from: (fields) => db.select(fields).from(material).$dynamic(),
		columns: {
			name: { sort: nocase(material.name) },
			sku: { sort: material.sku },
			unit: {
				sort: material.unit,
				filter: (units) => inArray(material.unit, units),
				group: material.unit,
			},
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
		id: material.id,
		scope: () => inTenant(material),
	};
};
