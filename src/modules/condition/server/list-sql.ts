/**
 * The Connect page's list in SQL (see `../list/units-list.ts`), shared by its rows, its counts (the
 * KPI tiles and the customer chips) and the dashboard's tile.
 */
import { and, ne, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment, equipmentLocation } from "#lib/server/db/schema.ts";
import { type ListSql, nocase } from "#lib/server/lists/index.ts";

import { conditionList } from "../list/units-list.ts";
import { type ConditionSql, conditionSql } from "./status-sql.ts";

/** The list's joins: the unit's owner, site and location (if any), each in the tenant. */
export const withUnitJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId));

/** The units in care: the tenant's, but the decommissioned ones. */
export const inCare = () => and(inTenant(equipment), ne(equipment.status, "decommissioned"))!;

/** An inspection status's place, worst first, like the equipment list's column. */
const inspectionRank = (inspection: ConditionSql["inspection"]) =>
	inspection
		? sql`(case ${inspection} when 'expired' then 0 when 'rejected' then 1 when 'expiring' then 2 when 'valid' then 3 else 4 end)`
		: sql`4`;

/**
 * The list's columns in SQL, checked against its definition, with the unit's condition (`unit`,
 * built once for the request, so the rows' query can select the same). Call it per request.
 */
export function unitsSql(
	unit: ConditionSql = conditionSql(),
): ListSql<typeof conditionList.columns> & { unit: ConditionSql } {
	return {
		unit,
		list: conditionList,
		from: (fields) => withUnitJoins(db.select(fields).from(equipment).$dynamic()),
		columns: {
			unit: {
				sort: [
					nocase(sql`coalesce(${equipment.name}, ${equipment.manufacturer})`),
					nocase(equipment.model),
				],
			},
			location: { sort: [nocase(customerSite.name), nocase(equipmentLocation.name)] },
			customer: {
				sort: nocase(customer.name),
				filter: (codes) => inList(customer.code, codes),
			},
			condition: {
				sort: unit.score,
				nullsLast: true,
				filter: (bands) => inList(unit.band, bands),
			},
			lastService: { sort: unit.lastService, nullsLast: true },
			nextDue: { sort: unit.nextDue ?? sql`null`, nullsLast: true },
			inspection: { sort: inspectionRank(unit.inspection) },
			status: {
				sort: unit.sort,
				filter: (statuses) => inList(unit.status, statuses),
			},
		},
		search: [
			equipment.serialNumber,
			equipment.name,
			equipment.manufacturer,
			equipment.model,
			customer.name,
			customer.code,
			equipmentLocation.name,
		],
		id: equipment.id,
		scope: inCare,
	};
}
