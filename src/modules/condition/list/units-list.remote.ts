/**
 * The Connect page's list and its counts: the KPI tiles, the customer chips and the filters' counts.
 * A row per component of a unit in care, and one per unit in care without components.
 */
import { sql } from "drizzle-orm";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { customerFacet, planList } from "#lib/server/lists/index.ts";

import { query } from "../remote-functions.ts";
import { articlesById } from "../server/components.ts";
import { rowsSql, withRowJoins } from "../server/list-sql.ts";
import { component } from "../server/schema.ts";
import { thresholdsOf } from "../server/settings.ts";
import { conditionList } from "./units-list.ts";

/** A day as SQLite has it (`yyyy-mm-dd`), as a day; none for none. */
const asDay = (value: string | null) => (value ? Temporal.PlainDate.from(value) : null);

/**
 * A page of the rows (the components of the tenant's units in care, and those units without
 * components) with their condition and status, their unit's and what the other modules know of it
 * (its inspection, its next visit), searched, filtered and sorted as the query says (worst first by
 * default), and how many match. With the tenant's thresholds, which colour the scores, and which
 * columns the tenant has (inspection with checklists, next due with maintenance).
 */
export const getConditionUnits = query(conditionList.query, async (input) => {
	const listSql = rowsSql();
	const { unit, row } = listSql;
	const plan = planList(listSql, input);
	const [found, rowCount, thresholds] = await Promise.all([
		plan.paged(
			withRowJoins(
				db
					.select({
						id: listSql.rowId,
						component: {
							id: component.id,
							number: component.number,
							name: component.name,
							materialId: component.materialId,
						},
						unitId: equipment.id,
						serialNumber: equipment.serialNumber,
						name: equipment.name,
						manufacturer: equipment.manufacturer,
						model: equipment.model,
						customer: { code: customer.code, name: customer.name },
						site: customerSite.name,
						location: { id: equipmentLocation.id, name: equipmentLocation.name },
						score: row.score,
						band: row.band,
						advice: row.advice,
						lastService: unit.lastService,
						nextDue: sql<string | null>`${unit.nextDue ?? sql`null`}`.mapWith(asDay),
						inspection: sql<string | null>`${unit.inspection ?? sql`null`}`,
						status: row.status,
						concern: row.concern,
					})
					.from(equipment)
					.$dynamic(),
			),
		),
		plan.count(),
		thresholdsOf(),
	]);
	const known = await articlesById(found.flatMap((each) => each.component?.materialId ?? []));
	const rows = found.map(({ component: part, ...each }) => ({
		...each,
		id: Number(each.id),
		// A unit's own row has none.
		component: part?.id
			? {
					id: part.id,
					number: part.number!,
					name: part.name!,
					sku: part.materialId === null ? null : (known.get(part.materialId)?.sku ?? null),
				}
			: null,
	}));
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
 * The counts of the rows that match the search and the other filters: by status (the KPI tiles),
 * by score band, and by customer (the chips, most rows first, with their names).
 */
export const getConditionCounts = query(conditionList.where, async (where) => {
	const listSql = rowsSql();
	const facets = await planList(listSql, where).facets({
		status: listSql.row.status,
		condition: listSql.row.band,
		customer: customer.code,
	});
	const customers = (await customerFacet(facets.customer)).toSorted(
		(a, b) => b.count - a.count || a.name.localeCompare(b.name),
	);
	return { status: facets.status, condition: facets.condition, customers };
});
