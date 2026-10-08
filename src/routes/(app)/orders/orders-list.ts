import { code, defineList, id, oneOf } from "#lib/components/data-table/list-definition.ts";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

/**
 * The orders list: what it sorts, groups and filters by, and with which values. The page, the
 * table, the server's SQL (`ordersSql` in `order-list.server.ts`) and the bulk commands read it.
 * Its state is in the URL, e.g. `?customer=CUST-0001&status=quote,scheduled&sort=-priority,number&page=2`
 * (`columns.spec.ts` checks that the table reads and writes the same). Customers are filtered (and
 * grouped) by code, equipment by serial number, engineers by id.
 */
export const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		equipment: { sort: true, filter: code },
		type: { sort: true, group: true, filter: oneOf(orderTypes) },
		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
		priority: { sort: true, group: true, filter: oneOf(orderPriorities) },
		engineer: { sort: true, group: true, filter: id },
		scheduledFor: { param: "scheduled", sort: true },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "createdAt", desc: true }], pageSize: 20 },
});
