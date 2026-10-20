/**
 * A unit's next maintenance visit in SQL: a correlated subquery for the earliest due date of its
 * active plans. The equipment list's column (`columns/equipment.list.ts`) and the condition
 * module's units (`condition.signals`) both read it. It binds no parameters (the condition module
 * repeats it in one statement, which may bind at most 100): the plans are in the tenant of the unit
 * they're correlated with, which the outer query holds to the request's (`inTenant(equipment)`).
 */
import { and, eq, sql } from "drizzle-orm";

import { sameTenant } from "#lib/server/auth/index.ts";
import { equipment } from "#lib/server/db/schema.ts";
import type { UnitSignals } from "#modules/condition/api/extensions.ts";

import { maintenancePlan } from "./schema.ts";

export const nextDueSql = () =>
	sql<string | null>`(select min(${maintenancePlan.nextDueOn}) from ${maintenancePlan} where ${and(
		eq(maintenancePlan.equipmentId, equipment.id),
		sameTenant(maintenancePlan, equipment),
		sql`${maintenancePlan.paused} = 0`,
	)})`;

/** `condition.signals`: the unit's next maintenance visit. */
export const nextDueSignal = (): UnitSignals => ({ nextDue: nextDueSql() });
