import type { TableUrlSpec } from "#lib/components/data-table/url-state.js";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.js";

/**
 * The orders list's state in the URL, which the server reads to page, filter and sort it (see
 * `getOrders`): the same columns, parameters and defaults as the table's (`columns.spec.ts`
 * checks), e.g. `?customer=CUST-0001&status=quote,scheduled&sort=-priority,number&page=2`.
 * Customers are filtered (and grouped) by code, equipment by serial number, engineers by id.
 */
export const ordersUrl: TableUrlSpec = {
	columns: [
		{ id: "number", sortable: true },
		{ id: "customer", sortable: true, groupable: true, filter: "set" },
		{ id: "equipment", sortable: true, filter: "set" },
		{ id: "type", sortable: true, groupable: true, filter: "set", values: orderTypes },
		{ id: "status", sortable: true, groupable: true, filter: "set", values: orderStatuses },
		{ id: "priority", sortable: true, groupable: true, filter: "set", values: orderPriorities },
		{ id: "engineer", sortable: true, groupable: true, filter: "set" },
		{ id: "scheduledFor", param: "scheduled", sortable: true },
		{ id: "createdAt", param: "created", sortable: true },
	],
	defaults: {
		sorting: [{ id: "createdAt", desc: true }],
		pagination: { pageIndex: 0, pageSize: 20 },
	},
};
