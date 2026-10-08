import type { TableUrlSpec } from "#lib/components/data-table/url-state.js";
import { equipmentCategories, equipmentStatuses } from "#lib/models.js";

/**
 * The equipment list's state in the URL, which the server reads to page, filter and sort it (see
 * `getEquipmentList`): the same columns, parameters and defaults as the table's (`columns.spec.ts`
 * checks), e.g. `?customer=CUST-0001&category=chiller&sort=-warranty`. Customers are filtered by
 * code.
 */
export const equipmentUrl: TableUrlSpec = {
	columns: [
		{ id: "unit", sortable: true },
		{ id: "serialNumber", param: "serial", sortable: true },
		{ id: "manufacturer", sortable: true, filter: "set" },
		{ id: "category", sortable: true, filter: "set", values: equipmentCategories },
		{ id: "status", sortable: true, filter: "set", values: equipmentStatuses },
		{ id: "customer", sortable: true, filter: "set" },
		{ id: "installedAt", param: "installed", sortable: true },
		{ id: "warrantyUntil", param: "warranty", sortable: true },
		{ id: "openOrders", param: "open-orders", sortable: true },
	],
	defaults: {
		sorting: [{ id: "unit", desc: false }],
		pagination: { pageIndex: 0, pageSize: 20 },
	},
};
