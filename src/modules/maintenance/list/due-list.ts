import { code, defineList, oneOf } from "#lib/components/data-table/list-definition.ts";

import { defaultDueRange, dueRanges, planOrderTypes } from "../model.ts";

/**
 * The due list: the tenant's active plans, as far ahead as the range says (`?due=`, overdue plus
 * the next 30 days unless the URL says otherwise; `?due=` alone is every plan), searched, sorted
 * and paged in the database (`dueSql` in `../server/list-sql.ts`). Its state is in the URL, e.g.
 * `?due=overdue&type=inspection&sort=customer`.
 */
export const dueList = defineList({
	columns: {
		unit: { sort: true },
		customer: { sort: true, filter: code },
		plan: { sort: true },
		type: { filter: oneOf(planOrderTypes) },
		interval: { sort: true },
		nextDue: { param: "next-due", sort: true },
		lastOrder: { param: "last-order", sort: true },
		due: { filter: oneOf(dueRanges) },
	},
	defaults: {
		sort: [{ id: "nextDue", desc: false }],
		filters: { due: [defaultDueRange] },
	},
});
