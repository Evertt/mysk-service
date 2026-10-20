import { code, defineList, oneOf } from "#lib/components/data-table/list-definition.ts";

import { unitStatuses } from "../model.ts";

/** A score's band in a filter: below the critical threshold, below attention, fine, or none yet. */
export const scoreBands = ["low", "fair", "good", "none"] as const;
export type ScoreFilter = (typeof scoreBands)[number];

/**
 * The Connect page's list: the components of the tenant's units in care (all but the
 * decommissioned), and those units without components, a row each, worst first, searched, sorted,
 * filtered and paged in the database (`rowsSql` in `../server/list-sql.ts`). Its state is in the
 * URL, e.g. `?customer=RIE-001&status=critical,attention`: the customer chips and "only what needs
 * attention" set those filters.
 */
export const conditionList = defineList({
	columns: {
		component: { sort: true },
		unit: { sort: true },
		customer: { sort: true, filter: code },
		condition: { sort: true, filter: oneOf(scoreBands) },
		lastService: { param: "last-service", sort: true },
		nextDue: { param: "next-due", sort: true },
		inspection: { sort: true },
		status: { sort: true, filter: oneOf(unitStatuses) },
		advice: {},
	},
	defaults: { sort: [{ id: "status", desc: false }] },
});
