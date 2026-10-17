/** How many of the tenant's units in care are critical and need attention: the dashboard's tile. */
import { planList } from "#lib/server/lists/index.ts";

import { query } from "./remote-functions.ts";
import { unitsSql } from "./server/list-sql.ts";

export const getConditionOverview = query(async () => {
	const listSql = unitsSql();
	const { status } = await planList(listSql, { q: "", filters: {} }).facets({
		status: listSql.unit.status,
	});
	return { critical: status.critical ?? 0, attention: status.attention ?? 0 };
});
