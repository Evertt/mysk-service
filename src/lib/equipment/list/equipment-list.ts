import {
	code,
	dateRange,
	defineList,
	numberRange,
	oneOf,
} from "#lib/components/data-table/list-definition.ts";
import { equipmentCategories, equipmentStatuses } from "#lib/models.ts";

import { listColumns } from "../extensions.ts";

/**
 * The equipment list: what it sorts, groups and filters by, and with which values. The page, the
 * table, the server's SQL (`equipmentSql` in `equipment-list.server.ts`) and the bulk commands read
 * it. Its state is in the URL, e.g. `?customer=CUST-0001&category=chiller&sort=-warranty`
 * (`columns.spec.ts` checks that the table reads and writes the same). Customers are filtered (and
 * grouped) by code, manufacturers by name; the dates by a range of days (`?warranty=before-today`:
 * the units out of warranty) and the open orders by a range (`?open-orders=1..`), see `ranges.ts`.
 */
export const equipmentList = defineList({
	columns: {
		unit: { sort: true },
		serialNumber: { param: "serial", sort: true },
		manufacturer: { sort: true, group: true, filter: code },
		category: { sort: true, group: true, filter: oneOf(equipmentCategories) },
		status: { sort: true, group: true, filter: oneOf(equipmentStatuses) },
		customer: { sort: true, group: true, filter: code },
		installedAt: { param: "installed", sort: true, filter: dateRange },
		warrantyUntil: { param: "warranty", sort: true, filter: dateRange },
		openOrders: { param: "open-orders", sort: true, filter: numberRange },
	},
	defaults: { sort: [{ id: "unit", desc: false }], pageSize: 20 },
	// The tenant's modules may add columns, e.g. maintenance's next due date.
	moduleColumns: listColumns,
});
