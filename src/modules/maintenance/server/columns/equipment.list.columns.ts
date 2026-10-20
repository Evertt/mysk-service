/**
 * The SQL of the maintenance module's column in the equipment list (see
 * `../../columns/equipment.list.columns.ts`): the earliest due date of the unit's active plans
 * (`../next-due-sql.ts`).
 */
import { sql } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import { nextMaintenance } from "../../columns/equipment.list.columns.ts";
import { SOON_DAYS } from "../../model.ts";
import { nextDueSql } from "../next-due-sql.ts";
import { maintenancePlan } from "../schema.ts";

export default [
	columnSql(nextMaintenance, () => {
		const next = nextDueSql().mapWith(maintenancePlan.nextDueOn);
		const today = currentDay();
		// The filter's values; `later` for a unit whose next visit is further off (in none of them).
		// Days as `yyyy-mm-dd` compare as text.
		const bucket = sql<string>`(case when ${next} is null then 'none' when ${next} < ${today.toString()} then 'overdue' when ${next} < ${today.add({ days: SOON_DAYS }).toString()} then 'soon' else 'later' end)`;
		return {
			value: next,
			sort: next,
			nullsLast: true,
			filter: (values) => inList(bucket, values),
			// Counted under `none` (`noneToken`) when there's no plan.
			facet: sql`nullif(${bucket}, 'none')`,
		};
	}),
];
