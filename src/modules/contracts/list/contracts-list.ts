import { code, defineList, moneyRange, oneOf } from "#lib/components/data-table/list-definition.ts";

import { contractLevels, contractStatuses } from "../model.ts";

/**
 * The contracts list: what it sorts, groups and filters by, and with which values. A small list,
 * loaded whole and filtered in the browser (`mode: "client"`). Its state is in the URL, e.g.
 * `?status=active&level=premium&fee=..500`. Customers are filtered (and grouped) by code; the
 * status follows from the period and today's date.
 */
export const contractsList = defineList({
	mode: "client",
	columns: {
		number: { sort: true },
		customer: { sort: true, group: true, filter: code },
		level: { sort: true, group: true, filter: oneOf(contractLevels) },
		status: { sort: true, group: true, filter: oneOf(contractStatuses) },
		period: { sort: true },
		units: { sort: true },
		responseHours: { param: "response", sort: true },
		monthlyFee: { param: "fee", sort: true, filter: moneyRange },
		createdAt: { param: "created", sort: true },
	},
	defaults: { sort: [{ id: "period", desc: true }] },
});
