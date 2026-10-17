/** The Connect page's list and its counts: the KPI tiles, the customer chips and the filters' counts. */
import { and, sql } from "drizzle-orm";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { planList } from "#lib/server/lists/index.ts";

import { query } from "../remote-functions.ts";
import { unitsSql, withUnitJoins } from "../server/list-sql.ts";
import { thresholdsOf } from "../server/settings.ts";
import { conditionList } from "./units-list.ts";

/** A day as SQLite has it (`yyyy-mm-dd`), as a day; none for none. */
const asDay = (value: string | null) => (value ? Temporal.PlainDate.from(value) : null);

/**
 * A page of the tenant's units in care with their condition, status and what the other modules
 * know of them (their inspection, their next visit), searched, filtered and sorted as the query
 * says (worst first by default), and how many match. With the tenant's thresholds, which colour the
 * scores, and which columns the tenant has (inspection with checklists, next due with maintenance).
 */
export const getConditionUnits = query(conditionList.query, async (input) => {
	const listSql = unitsSql();
	const { unit } = listSql;
	const plan = planList(listSql, input);
	const [rows, rowCount, thresholds] = await Promise.all([
		plan.paged(
			withUnitJoins(
				db
					.select({
						id: equipment.id,
						serialNumber: equipment.serialNumber,
						name: equipment.name,
						manufacturer: equipment.manufacturer,
						model: equipment.model,
						customer: { code: customer.code, name: customer.name },
						site: customerSite.name,
						location: { id: equipmentLocation.id, name: equipmentLocation.name },
						score: unit.score,
						band: unit.band,
						advice: unit.advice,
						lastService: unit.lastService,
						nextDue: sql<string | null>`${unit.nextDue ?? sql`null`}`.mapWith(asDay),
						inspection: sql<string | null>`${unit.inspection ?? sql`null`}`,
						status: unit.status,
						concern: unit.concern,
					})
					.from(equipment)
					.$dynamic(),
			),
		),
		plan.count(),
		thresholdsOf(),
	]);
	return {
		rows,
		rowCount,
		thresholds,
		/** Which of the other modules' columns the tenant has. */
		has: { inspection: unit.inspection !== null, nextDue: unit.nextDue !== null },
		/** The query the rows are for. */
		query: input,
		key: queryKey(input),
	};
});

/**
 * The counts of the units that match the search and the other filters: by status (the KPI
 * tiles), by score band, and by customer (the chips, most units first, with their names).
 */
export const getConditionCounts = query(conditionList.where, async (where) => {
	const listSql = unitsSql();
	const facets = await planList(listSql, where).facets({
		status: listSql.unit.status,
		condition: listSql.unit.band,
		customer: customer.code,
	});
	const codes = Object.keys(facets.customer);
	const names = codes.length
		? await db
				.select({ code: customer.code, name: customer.name })
				.from(customer)
				.where(and(inList(customer.code, codes), inTenant(customer)))
		: [];
	const customers = names
		.map((row) => ({ ...row, count: facets.customer[row.code] ?? 0 }))
		.toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	return { status: facets.status, condition: facets.condition, customers };
});
