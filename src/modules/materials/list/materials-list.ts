import {
	defineList,
	moneyRange,
	numberRange,
	oneOf,
} from "#lib/components/data-table/list-definition.ts";

import { materialUnits, stockLevels } from "../model.ts";

/**
 * The materials list: what it sorts, groups and filters by, and with which values. The page, the
 * table, the server's SQL (`materialsSql` in `material-list.server.ts`) and the bulk command read
 * it. Its state is in the URL, e.g. `?stock=out,low&sort=-price` (the dashboard links to the
 * first; `columns.spec.ts` checks that the table reads and writes the same). The quantity in stock and the number of orders
 * it was used on filter by ranges, e.g. `?quantity=..10`: at most 10 in stock, and the price by
 * amounts in euros, `?price=..12.50` (see `ranges.ts`).
 */
export const materialsList = defineList({
	columns: {
		name: { sort: true },
		sku: { sort: true },
		unit: { sort: true, group: true, filter: oneOf(materialUnits) },
		unitPrice: { param: "price", sort: true, filter: moneyRange },
		stock: { param: "quantity", sort: true, filter: numberRange },
		stockLevel: { param: "stock", sort: true, group: true, filter: oneOf(stockLevels) },
		orderCount: { param: "used", sort: true, filter: numberRange },
	},
	defaults: { sort: [{ id: "name", desc: false }], pageSize: 20 },
});
