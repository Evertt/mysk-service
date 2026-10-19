/**
 * The due list in SQL (see `../list/due-list.ts`), shared by its queries and the "Create orders"
 * bulk command, which may act on every plan matching its filters.
 */
import { and, eq, lt } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { currentDay } from "#lib/dates.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { type ListSql, nocase } from "#lib/server/lists/index.ts";

import { dueList } from "../list/due-list.ts";
import { dueBefore } from "../model.ts";
import { maintenancePlan } from "./schema.ts";

/**
 * The due list's joins: the plan's unit, its customer and its last order, each in the tenant.
 * Written once, for the rows, the counts and the bulk ids alike.
 */
export const withPlanJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(equipment, maintenancePlan.equipmentId))
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.leftJoin(...tenantJoin(order, maintenancePlan.lastOrderId));

/**
 * The due list's columns in SQL, checked against its definition. Call it for each request: the
 * tenant and today are the request's.
 */
export const dueSql = (today = currentDay()): ListSql<typeof dueList.columns> => ({
	list: dueList,
	from: (fields) => withPlanJoins(db.select(fields).from(maintenancePlan).$dynamic()),
	columns: {
		unit: { sort: [nocase(equipment.manufacturer), nocase(equipment.model)] },
		customer: {
			sort: nocase(customer.name),
			filter: (codes) => inList(customer.code, codes),
		},
		plan: { sort: nocase(maintenancePlan.description) },
		type: { filter: (types) => inList(maintenancePlan.orderType, types) },
		interval: { sort: maintenancePlan.intervalMonths },
		nextDue: { sort: maintenancePlan.nextDueOn },
		lastOrder: { sort: order.number, nullsLast: true },
		// The ranges are horizons: the furthest of those asked for.
		due: {
			filter: (ranges) =>
				lt(
					maintenancePlan.nextDueOn,
					ranges
						.map((range) => dueBefore(range, today))
						.reduce((a, b) => (Temporal.PlainDate.compare(a, b) > 0 ? a : b)),
				),
		},
	},
	search: [
		equipment.serialNumber,
		equipment.manufacturer,
		equipment.model,
		customer.name,
		customer.code,
		maintenancePlan.description,
	],
	id: maintenancePlan.id,
	// Paused plans aren't due.
	scope: () => and(inTenant(maintenancePlan), eq(maintenancePlan.paused, false))!,
});
