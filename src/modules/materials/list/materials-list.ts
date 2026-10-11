import { defineList, oneOf } from "#lib/components/data-table/list-definition.ts";

import { materialUnits, stockLevels } from "../model.ts";

/**
 * The materials list: what it sorts, groups and filters by, and with which values. The page, the
 * table, the server's SQL (`materialsSql` in `material-list.server.ts`) and the bulk command read
 * it. Its state is in the URL, e.g. `?stock=out,low&sort=-price` (the dashboard links to the
 * first; `columns.spec.ts` checks that the table reads and writes the same).
 */
export const materialsList = defineList({
	columns: {
		name: { sort: true },
		sku: { sort: true },
		unit: { sort: true, group: true, filter: oneOf(materialUnits) },
		unitPrice: { param: "price", sort: true },
		stock: { param: "quantity", sort: true },
		stockLevel: { param: "stock", sort: true, group: true, filter: oneOf(stockLevels) },
		orderCount: { param: "used", sort: true },
	},
	defaults: { sort: [{ id: "name", desc: false }], pageSize: 20 },
});
