import {
	code,
	dateRange,
	defineList,
	numberRange,
	oneOf,
} from "#lib/components/data-table/list-definition.ts";
import { customerSegments } from "#lib/models.ts";

/**
 * The customers list: what it sorts, groups and filters by, and with which values. A small list,
 * loaded whole and filtered in the browser (`mode: "client"`). Its state is in the URL, e.g.
 * `?segment=enterprise&country=Belgium&open-orders=1..&since=this-year`.
 */
export const customersList = defineList({
	mode: "client",
	columns: {
		name: { sort: true },
		contactName: { param: "contact", sort: true },
		segment: { sort: true, group: true, filter: oneOf(customerSegments) },
		// By country, as stored (in English).
		country: { sort: true, group: true, filter: code },
		equipmentCount: { param: "equipment", sort: true, filter: numberRange },
		openOrders: { param: "open-orders", sort: true, filter: numberRange },
		createdAt: { param: "since", sort: true, filter: dateRange },
		// What the search box finds them by besides (see the table's columns).
		search: {},
	},
	defaults: { sort: [{ id: "name", desc: false }] },
});
