/**
 * The SQL of the maintenance module's column in the equipment list (see
 * `../../columns/equipment.list.ts`): a correlated subquery for the earliest due date of the
 * unit's active plans, in the tenant.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { addDays, startOfDay } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import { nextMaintenance } from "../../columns/equipment.list.ts";
import { SOON_DAYS } from "../../model.ts";
import { maintenancePlan } from "../schema.ts";

/** Timestamps are stored in seconds. */
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

export default [
	columnSql(nextMaintenance, () => {
		const next =
			sql<Date | null>`(select min(${maintenancePlan.nextDueOn}) from ${maintenancePlan} where ${and(
				eq(maintenancePlan.equipmentId, equipment.id),
				eq(maintenancePlan.paused, false),
				inTenant(maintenancePlan),
			)})`.mapWith(maintenancePlan.nextDueOn);
		const today = startOfDay(new Date());
		// The filter's values; `later` for a unit whose next visit is further off (in none of them).
		const bucket = sql<string>`(case when ${next} is null then 'none' when ${next} < ${seconds(today)} then 'overdue' when ${next} < ${seconds(addDays(today, SOON_DAYS))} then 'soon' else 'later' end)`;
		return {
			value: next,
			sort: next,
			nullsLast: true,
			filter: (values) => inArray(bucket, values),
			// Counted under `none` (`noneToken`) when there's no plan.
			facet: sql`nullif(${bucket}, 'none')`,
		};
	}),
];
