/**
 * The SQL of the maintenance module's column in the equipment list (see
 * `../../columns/equipment.list.ts`): a correlated subquery for the earliest due date of the
 * unit's active plans, in the tenant.
 */
import { and, eq, sql } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import { nextMaintenance } from "../../columns/equipment.list.ts";
import { SOON_DAYS } from "../../model.ts";
import { maintenancePlan } from "../schema.ts";

export default [
	columnSql(nextMaintenance, () => {
		const next =
			sql<Temporal.PlainDate | null>`(select min(${maintenancePlan.nextDueOn}) from ${maintenancePlan} where ${and(
				eq(maintenancePlan.equipmentId, equipment.id),
				eq(maintenancePlan.paused, false),
				inTenant(maintenancePlan),
			)})`.mapWith(maintenancePlan.nextDueOn);
		const today = Temporal.Now.plainDateISO(getTimeZone());
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
