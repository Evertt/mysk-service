/**
 * The Connect page's list in SQL (see `../list/units-list.ts`), shared by its rows and its counts
 * (the KPI tiles and the customer chips): a row per component of a unit in care, and one per unit
 * in care without components, so none is left out. A row's condition and status are its
 * component's (`componentSql()`), or its unit's for a unit without (`conditionSql()`); its
 * inspection, last and next visit are its unit's.
 */
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { type ListSql, nocase } from "#lib/server/lists/index.ts";

import { conditionList } from "../list/units-list.ts";
import { component } from "./schema.ts";
import {
	type ComponentSql,
	componentSql,
	type ConditionSql,
	conditionSql,
	statusRankSql,
} from "./status-sql.ts";

/** The list's joins: the unit's owner, site and location (if any), each in the tenant. */
const withUnitJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId));

/** The rows' joins: the unit's (`withUnitJoins()`) and its components, a row each (if any). */
export const withRowJoins = <T extends SQLiteSelect>(query: T) =>
	withUnitJoins(query).leftJoin(
		component,
		and(eq(component.equipmentId, equipment.id), inTenant(component)),
	);

/** The units in care: the tenant's, but the decommissioned ones. */
export const inCare = () => and(inTenant(equipment), ne(equipment.status, "decommissioned"))!;

/** An inspection status's place, worst first, like the equipment list's column. */
const inspectionRank = (inspection: ConditionSql["inspection"]) =>
	inspection
		? sql`(case ${inspection} when 'expired' then 0 when 'rejected' then 1 when 'expiring' then 2 when 'valid' then 3 else 4 end)`
		: sql`4`;

/** A row's: its component's `part`, or its unit's `whole` on a unit's own row. */
const either = <T>(part: SQL<T>, whole: SQL<T>) =>
	sql<T>`(case when ${component.id} is null then ${whole} else ${part} end)`;

/** A row's condition and status: its component's, or its unit's on a unit's own row. */
function rowSql(unit: ConditionSql = conditionSql(), part: ComponentSql = componentSql(unit)) {
	const score = either(part.score, unit.score).mapWith((value: number | null) =>
		value === null ? null : Number(value),
	) as SQL<number | null>;
	const status = either(part.status, unit.status);
	const concern = either(part.concern, unit.concern);
	return {
		score,
		advice: either(part.advice, unit.advice),
		band: either(part.band, unit.band),
		status,
		concern,
		sort: [statusRankSql(status), statusRankSql(concern), sql`coalesce(${score}, 101)`],
	};
}

export type RowSql = ReturnType<typeof rowSql>;

/**
 * The list's columns in SQL, checked against its definition, with the units' condition (`unit`)
 * and the rows' (`row`), built once for the request, so the rows' query can select the same. Call
 * it per request.
 */
export function rowsSql(
	unit: ConditionSql = conditionSql(),
): ListSql<typeof conditionList.columns> & { unit: ConditionSql; row: RowSql; rowId: SQL<number> } {
	const row = rowSql(unit);
	// A component's row by its id, made negative; a unit's own by the unit's id.
	const rowId = sql<number>`coalesce(-${component.id}, ${equipment.id})`.mapWith(Number);
	return {
		unit,
		row,
		rowId,
		list: conditionList,
		from: (fields) => withRowJoins(db.select(fields).from(equipment).$dynamic()),
		columns: {
			component: {
				sort: [
					nocase(sql`coalesce(${component.name}, '')`),
					nocase(sql`coalesce(${component.number}, '')`),
				],
			},
			unit: {
				sort: [
					nocase(sql`coalesce(${equipment.name}, ${equipment.manufacturer})`),
					nocase(equipment.model),
					nocase(customerSite.name),
					nocase(sql`coalesce(${equipmentLocation.name}, '')`),
				],
			},
			customer: {
				sort: nocase(customer.name),
				filter: (codes) => inList(customer.code, codes),
			},
			condition: {
				sort: row.score,
				nullsLast: true,
				filter: (bands) => inList(row.band, bands),
			},
			lastService: { sort: unit.lastService, nullsLast: true },
			nextDue: { sort: unit.nextDue ?? sql`null`, nullsLast: true },
			inspection: { sort: inspectionRank(unit.inspection) },
			status: {
				sort: row.sort,
				filter: (statuses) => inList(row.status, statuses),
			},
		},
		search: [
			component.name,
			component.number,
			equipment.serialNumber,
			equipment.name,
			equipment.manufacturer,
			equipment.model,
			customer.name,
			customer.code,
			equipmentLocation.name,
		],
		id: rowId,
		scope: inCare,
	};
}
