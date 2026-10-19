/** What the maintenance module's card on the dashboard shows. */
import { and, count, eq, gte, lt } from "drizzle-orm";

import { currentDay } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { SOON_DAYS } from "./model.ts";
import { query } from "./remote-functions.ts";
import { maintenancePlan } from "./server/schema.ts";

/** How many active plans are overdue, and how many are due within the next 30 days. */
export const getMaintenanceOverview = query(async () => {
	const today = currentDay();
	const active = and(inTenant(maintenancePlan), eq(maintenancePlan.paused, false));
	const counted = (from: Temporal.PlainDate | null, until: Temporal.PlainDate) =>
		db
			.select({ count: count() })
			.from(maintenancePlan)
			.where(
				and(
					active,
					from ? gte(maintenancePlan.nextDueOn, from) : undefined,
					lt(maintenancePlan.nextDueOn, until),
				),
			);
	const [[overdue], [soon]] = await Promise.all([
		counted(null, today),
		counted(today, today.add({ days: SOON_DAYS })),
	]);
	return { overdue: overdue.count, soon: soon.count };
});
