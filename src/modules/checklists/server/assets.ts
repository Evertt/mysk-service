/**
 * The work orders page ("Werkbonnen") on the server: its list of assets (the tenant's units in
 * service whose category has a template) in SQL, with where each stands this year, and one asset as
 * the page shows it: its unit, template and components, its checklists (the history the unit's page
 * shows too, `unitInspection()`), from which the page picks the one of this year.
 */
import { error } from "@sveltejs/kit";
import { and, eq, ne, type SQL, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { getTimeZone } from "#lib/dates.ts";
import { unitTitle } from "#lib/equipment/index.ts";
import { openOrderStatuses } from "#lib/models.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList, inLiterals, literal } from "#lib/server/db/parameters.ts";
import {
	customer,
	customerSite,
	equipment,
	equipmentCategory,
	equipmentLocation,
	order,
} from "#lib/server/db/schema.ts";
import { collect, collectNow } from "#lib/server/extensions.ts";
import { type ListSql, nocase } from "#lib/server/lists/index.ts";

import { componentSearch, unitComponents } from "../api/extensions.ts";
import { assetList } from "../assets/asset-list.ts";
import { yearBounds, type YearState } from "../model.ts";
import { checklist, checklistTemplate, checklistTemplateCategory } from "./schema.ts";
import { offeredTemplate } from "./templates.ts";
import { unitInspection } from "./unit-inspection.ts";

/** This year, in the user's time zone. */
export const currentYear = () => Temporal.Now.plainDateISO(getTimeZone()).year;

/** A moment as the database stores it: seconds. */
const seconds = (instant: Temporal.Instant) => Math.floor(instant.epochMilliseconds / 1000);

/**
 * Where the unit of the query's `equipment` row stands in `year` (see `yearStates`): correlated
 * subqueries in its own tenant, binding no parameters (the list repeats it in its select, filter
 * and counts).
 */
export function yearStateSql(year = currentYear()): SQL<YearState> {
	const { start, end } = yearBounds(year, getTimeZone());
	const ofUnit = and(
		eq(checklist.organizationId, equipment.organizationId),
		eq(checklist.equipmentId, equipment.id),
	);
	const completed = sql`exists (select 1 from ${checklist} where ${and(
		ofUnit,
		sql`${checklist.status} = 'completed'`,
		sql`${checklist.completedAt} >= ${literal(seconds(start))}`,
		sql`${checklist.completedAt} < ${literal(seconds(end))}`,
	)})`;
	const draft = sql`exists (select 1 from ${checklist} inner join ${order} on ${and(
		eq(order.organizationId, checklist.organizationId),
		eq(order.id, checklist.orderId),
	)} where ${and(
		ofUnit,
		sql`${checklist.status} = 'draft'`,
		inLiterals(order.status, openOrderStatuses),
	)})`;
	return sql<YearState>`(case when ${completed} then 'done' when ${draft} then 'open' else 'none' end)`;
}

/**
 * The list's joins: the unit's customer and site, its location (if any), and the template its
 * category has (a category has at most one), each in the tenant. Written once, for the rows, the
 * counts and the facets alike.
 */
export const withAssetJoins = <T extends SQLiteSelect>(query: T) =>
	query
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.innerJoin(
			checklistTemplateCategory,
			and(
				eq(checklistTemplateCategory.categoryId, equipment.categoryId),
				inTenant(checklistTemplateCategory),
			),
		)
		.innerJoin(...tenantJoin(checklistTemplate, checklistTemplateCategory.templateId));

/**
 * The list in SQL, checked against its definition. Call it for each request: the tenant, the year
 * and the modules (whose components the search finds units by) are the request's.
 */
export function assetSql(state = yearStateSql()): ListSql<typeof assetList.columns> {
	return {
		list: assetList,
		from: (fields) => withAssetJoins(db.select(fields).from(equipment).$dynamic()),
		columns: {
			unit: {
				sort: [
					nocase(sql`coalesce(${equipment.name}, ${equipment.manufacturer})`),
					nocase(equipment.model),
					equipment.serialNumber,
				],
			},
			customer: {
				sort: [nocase(customer.name), nocase(customerSite.name)],
				filter: (codes) => inList(customer.code, codes),
			},
			thisYear: { filter: (states) => inList(state, states) },
		},
		search: [
			equipment.serialNumber,
			equipment.name,
			equipment.manufacturer,
			equipment.model,
			customer.name,
			customer.code,
			customerSite.name,
			...collectNow(componentSearch, undefined),
		],
		id: equipment.id,
		// In service, with a template that's offered.
		scope: () =>
			and(
				inTenant(equipment),
				ne(equipment.status, "decommissioned"),
				eq(checklistTemplate.archived, false),
			)!,
	};
}

/** The fields of an asset as the list shows it. */
export const assetFields = (state: SQL<YearState>) => ({
	id: equipment.id,
	serialNumber: equipment.serialNumber,
	name: equipment.name,
	manufacturer: equipment.manufacturer,
	model: equipment.model,
	customer: { code: customer.code, name: customer.name },
	site: customerSite.name,
	location: equipmentLocation.name,
	thisYear: state,
});

/** The units' components (`checklists.components`), by unit: none without a module that knows. */
export async function componentsByUnit(equipmentIds: readonly number[]) {
	const found = equipmentIds.length ? (await collect(unitComponents, { equipmentIds })).flat() : [];
	return Map.groupBy(found, (part) => part.equipmentId);
}

/**
 * The tenant's unit `serialNumber` as the work orders page shows it (or a 404): its unit, customer,
 * site and category, the template its checklists are made with (none: it can't be started), its
 * components, and its checklists newest first with its inspection status (`unitInspection()`).
 */
export async function assetView(serialNumber: string) {
	const [unit] = await db
		.select({
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
			status: equipment.status,
			categoryId: equipment.categoryId,
			category: equipmentCategory.name,
			customer: { code: customer.code, name: customer.name },
			site: { name: customerSite.name, city: customerSite.city },
			location: equipmentLocation.name,
		})
		.from(equipment)
		.innerJoin(...tenantJoin(equipmentCategory, equipment.categoryId))
		.innerJoin(...tenantJoin(customer, equipment.customerId))
		.innerJoin(...tenantJoin(customerSite, equipment.siteId))
		.leftJoin(...tenantJoin(equipmentLocation, equipment.locationId))
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.checklists_equipment_not_found({ serial: serialNumber }));
	const [template, inspection, components] = await Promise.all([
		unit.status === "decommissioned" ? null : offeredTemplate(db, unit.categoryId),
		unitInspection(unit.id),
		componentsByUnit([unit.id]),
	]);
	const { categoryId: _category, ...shown } = unit;
	return {
		unit: { ...shown, title: unitTitle(unit) },
		template,
		components: components.get(unit.id) ?? [],
		...inspection,
		year: currentYear(),
	};
}
