/**
 * How many of the tenant's units in care are critical and need attention, with their components'
 * conditions taken in: the dashboard's tile.
 */
import { sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { query } from "./remote-functions.ts";
import { inCare } from "./server/list-sql.ts";
import { conditionSql } from "./server/status-sql.ts";

export const getConditionOverview = query(async () => {
	const unit = conditionSql();
	const found = await db
		.select({ status: unit.status, count: sql<number>`count(*)`.mapWith(Number) })
		.from(equipment)
		.where(inCare())
		.groupBy(unit.status);
	const count = (status: string) => found.find((row) => row.status === status)?.count ?? 0;
	return { critical: count("critical"), attention: count("attention") };
});
