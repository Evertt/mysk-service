import { code, defineList, oneOf } from "#lib/components/data-table/list-definition.ts";

import { yearStates } from "../model.ts";

/**
 * The work orders page's list of assets: the tenant's units in service whose category has a
 * template, with their customer and site, searched (unit, serial number, components, customer),
 * filtered by customer and by where they stand this year, and paged in the database (`assetSql` in
 * `../server/assets.ts`). Its state is in the URL, e.g. `?q=dock&customer=RIE&year=open`.
 */
export const assetList = defineList({
	columns: {
		unit: { sort: true },
		customer: { sort: true, filter: code },
		thisYear: { param: "year", filter: oneOf(yearStates) },
	},
	defaults: {
		sort: [
			{ id: "customer", desc: false },
			{ id: "unit", desc: false },
		],
		pageSize: 40,
	},
});
