import {
	code,
	dateRange,
	defineList,
	id,
	moneyRange,
	oneOf,
	orNone,
} from "#lib/components/data-table/list-definition.ts";
import { orderPriorities, orderStatuses, orderTypes } from "#lib/models.ts";

/**
 * The orders list: what it sorts, groups and filters by, and with which values. The page, the
 * table, the server's SQL (`ordersSql` in `order-list.server.ts`) and the bulk commands read it.
 * Its state is in the URL, e.g. `?customer=CUST-0001&status=quote,scheduled&sort=-priority,number&page=2`
 * (`columns.spec.ts` checks that the table reads and writes the same). Customers are filtered (and
 * grouped) by code, equipment by serial number, engineers by id; `?equipment=none` is the new
 * installations, `?engineer=none` the unassigned orders. The dates filter by a range of days,
 * e.g. `?scheduled=none,this-week` (unscheduled or this week) or `?created=today..`, and the total
 * by amounts in euros, `?total=500..` (see `ranges.ts`).
 */
export const ordersList = defineList({
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		equipment: { sort: true, filter: orNone(code) },
		type: { sort: true, group: true, filter: oneOf(orderTypes) },
		status: { sort: true, group: true, filter: oneOf(orderStatuses) },
		priority: { sort: true, group: true, filter: oneOf(orderPriorities) },
		engineer: { sort: true, group: true, filter: orNone(id) },
		scheduledFor: { param: "scheduled", sort: true, filter: orNone(dateRange) },
		createdAt: { param: "created", sort: true, filter: dateRange },
		// What `priceOrders()` makes of it, with the tenant's modules: filtered, not sorted.
		total: { filter: moneyRange },
	},
	defaults: { sort: [{ id: "createdAt", desc: true }], pageSize: 20 },
});
