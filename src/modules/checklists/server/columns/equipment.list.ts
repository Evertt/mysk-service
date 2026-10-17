/**
 * The SQL of the checklists module's column in the equipment list (see
 * `../../columns/equipment.list.ts`): a correlated subquery for each unit's latest completed
 * inspection, in the tenant, and its status today, as `inspectionStatus()` in `../../model.ts` has
 * it (expired, rejected, expiring, valid; none without one).
 */
import { and, desc, eq, isNotNull, type SQL, sql } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import { type InspectionValue, inspection } from "../../columns/equipment.list.ts";
import { EXPIRING_DAYS } from "../../model.ts";
import { checklist, checklistResult } from "../schema.ts";

export default [
	columnSql(inspection, () => {
		const today = Temporal.Now.plainDateISO(getTimeZone());
		// Days as `yyyy-mm-dd` compare as text.
		const status = sql`(case when ${checklist.validUntil} < ${today.toString()} then 'expired' when exists (select 1 from ${checklistResult} where ${and(
			eq(checklistResult.checklistId, checklist.id),
			eq(checklistResult.result, "nok"),
		)}) then 'rejected' when ${checklist.validUntil} <= ${today.add({ days: EXPIRING_DAYS }).toString()} then 'expiring' else 'valid' end)`;
		/** `what` of the unit's latest completed inspection, null without one. */
		const latest = (what: SQL) =>
			sql`(select ${what} from ${checklist} where ${and(
				eq(checklist.equipmentId, equipment.id),
				eq(checklist.kind, "inspection"),
				eq(checklist.status, "completed"),
				isNotNull(checklist.validUntil),
				inTenant(checklist),
			)} order by ${desc(checklist.completedAt)}, ${desc(checklist.id)} limit 1)`;
		const bucket = sql<string>`coalesce(${latest(status)}, 'none')`;
		return {
			value: latest(
				sql`json_object('status', ${status}, 'until', ${checklist.validUntil})`,
			).mapWith((text: string | null): InspectionValue => (text ? JSON.parse(text) : null)),
			// Worst first: expired, rejected, expiring, valid, then the units without one.
			sort: sql`(case ${bucket} when 'expired' then 0 when 'rejected' then 1 when 'expiring' then 2 when 'valid' then 3 else 4 end)`,
			filter: (values) => inList(bucket, values),
			// Counted under `none` (`noneToken`) without one.
			facet: sql`nullif(${bucket}, 'none')`,
		};
	}),
];
