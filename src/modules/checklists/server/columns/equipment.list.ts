/**
 * The SQL of the checklists module's column in the equipment list (see
 * `../../columns/equipment.list.ts`): each unit's latest completed inspection and its status today
 * (`../inspection-sql.ts`).
 */
import { sql } from "drizzle-orm";

import { inList } from "#lib/server/db/parameters.ts";
import { columnSql } from "#lib/server/lists/index.ts";

import { type InspectionValue, inspection } from "../../columns/equipment.list.ts";
import { inspectionSql } from "../inspection-sql.ts";

export default [
	columnSql(inspection, () => {
		const { latest, bucket } = inspectionSql();
		return {
			value: latest.mapWith((text: string | null): InspectionValue =>
				text ? JSON.parse(text) : null,
			),
			// Worst first: expired, rejected, expiring, valid, then the units without one.
			sort: sql`(case ${bucket} when 'expired' then 0 when 'rejected' then 1 when 'expiring' then 2 when 'valid' then 3 else 4 end)`,
			filter: (values) => inList(bucket, values),
			// Counted under `none` (`noneToken`) without one.
			facet: sql`nullif(${bucket}, 'none')`,
		};
	}),
];
