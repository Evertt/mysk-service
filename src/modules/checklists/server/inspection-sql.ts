/**
 * A unit's inspection status in SQL, as `inspectionStatus()` in `../model.ts` has it: a correlated
 * subquery for its latest completed inspection (expired, rejected, expiring, valid; none without
 * one). The equipment list's column (`columns/equipment.list.ts`) and the condition module's status
 * (`condition.signals`) both read it. Built per request: today is the request's.
 *
 * It binds no parameters: the condition module repeats it many times in one statement, which may
 * bind at most 100. So the checklist is in the tenant of the unit it's correlated with (the outer
 * query holds the unit to the request's tenant with `inTenant(equipment)`), and its constants are
 * written in (`literal()`).
 */
import { and, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { literal } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { EXPIRING_DAYS } from "../model.ts";
import { checklist, checklistResult } from "./schema.ts";

export function inspectionSql(today = Temporal.Now.plainDateISO(getTimeZone())) {
	// Days as `yyyy-mm-dd` compare as text.
	const status = sql`(case when ${checklist.validUntil} < ${literal(today.toString())} then 'expired' when exists (select 1 from ${checklistResult} where ${and(
		eq(checklistResult.checklistId, checklist.id),
		sql`${checklistResult.result} = 'nok'`,
	)}) then 'rejected' when ${checklist.validUntil} <= ${literal(today.add({ days: EXPIRING_DAYS }).toString())} then 'expiring' else 'valid' end)`;
	/**
	 * `what` of the unit's latest completed inspection with its last valid day (as
	 * `unitInspection()` takes it), null without one.
	 */
	const latest = (what: SQL) =>
		sql`(select ${what} from ${checklist} where ${and(
			eq(checklist.equipmentId, equipment.id),
			eq(checklist.organizationId, equipment.organizationId),
			sql`${checklist.kind} = 'inspection'`,
			sql`${checklist.status} = 'completed'`,
			isNotNull(checklist.validUntil),
		)} order by ${desc(checklist.completedAt)}, ${desc(checklist.id)} limit 1)`;
	return {
		/** The status and last valid day of the latest, as JSON; null without one. */
		latest: latest(sql`json_object('status', ${status}, 'until', ${checklist.validUntil})`),
		/** The status, `none` without one. */
		bucket: sql<string>`coalesce(${latest(status)}, 'none')`,
	};
}
