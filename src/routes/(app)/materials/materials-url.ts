import type { TableUrlSpec } from "#lib/components/data-table/url-state.js";
import { materialUnits, stockLevels } from "#lib/models.js";

/**
 * The materials list's state in the URL, which the server reads to page, filter and sort it (see
 * `getMaterials`): the same columns, parameters and defaults as the table's (`columns.spec.ts`
 * checks), e.g. `?stock=out,low&sort=-price` (the dashboard links to the first).
 */
export const materialsUrl: TableUrlSpec = {
	columns: [
		{ id: "name", sortable: true },
		{ id: "sku", sortable: true },
		{ id: "unit", sortable: true, filter: "set", values: materialUnits },
		{ id: "unitPrice", param: "price", sortable: true },
		{ id: "stock", param: "quantity", sortable: true },
		{ id: "stockLevel", param: "stock", sortable: true, filter: "set", values: stockLevels },
		{ id: "orderCount", param: "used", sortable: true },
	],
	defaults: {
		sorting: [{ id: "name", desc: false }],
		pagination: { pageIndex: 0, pageSize: 20 },
	},
};
