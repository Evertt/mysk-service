/**
 * The materials list in SQL, shared by its queries and the bulk command that acts on the materials
 * matching its filters (both in `material-list.remote.ts`). A remote file can only export remote
 * functions, so it can't be shared from there.
 */
import { and, eq, sql } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { between, type ListSql, nocase, rank } from "#lib/server/lists/index.ts";

import { materialsList } from "../list/materials-list.ts";
import { stockLevels } from "../model.ts";
import { material, orderLine } from "./schema.ts";
import { stockLevelSql } from "./stock.ts";

/**
 * The materials list's columns in SQL, checked against its definition (`materialsList`). Call it
 * for each request, not at module scope: `inTenant()` reads the request.
 */
export const materialsSql = (): ListSql<typeof materialsList.columns> => {
	const level = stockLevelSql(material.stock, material.unit);
	const orderCount = sql`(select count(distinct ${orderLine.orderId}) from ${orderLine} where ${and(
		inTenant(orderLine),
		eq(orderLine.materialId, material.id),
	)})`;
	return {
		list: materialsList,
		// No joins: the usage is counted in a subquery, to sort by it.
		from: (fields) => db.select(fields).from(material).$dynamic(),
		columns: {
			name: { sort: nocase(material.name) },
			sku: { sort: material.sku },
			unit: {
				sort: material.unit,
				filter: (units) => inList(material.unit, units),
				group: material.unit,
			},
			unitPrice: {
				sort: material.unitPrice,
				filter: (ranges) => between(material.unitPrice, ranges),
			},
			stock: { sort: material.stock, filter: (ranges) => between(material.stock, ranges) },
			// From out of stock to in stock rather than alphabetically.
			stockLevel: {
				sort: rank(level, stockLevels),
				filter: (levels) => inList(level, levels),
				group: level,
			},
			// Counted for every material to sort and filter by them (the page's own are counted apart).
			orderCount: { sort: orderCount, filter: (ranges) => between(orderCount, ranges) },
		},
		search: [material.name, material.sku],
		id: material.id,
		scope: () => inTenant(material),
	};
};
