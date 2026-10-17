/**
 * The work orders page's remote functions, for every office member of a tenant with the module:
 * the list of assets and its filters' counts, an asset with its checklists, a component's scores,
 * starting a unit's inspection or maintenance ("Keuring 2026"), and filling a checklist in on the
 * engineer's behalf (a paper form brought back), by the same rules as the portal.
 */
import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, equipment } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";
import { planList, refreshRequested } from "#lib/server/lists/index.ts";

import { componentScores } from "../api/extensions.ts";
import {
	answerSchema,
	checklistIdSchema,
	pointRemarkSchema,
	remarksSchema,
} from "../form/fill-schema.ts";
import { checklistKinds } from "../model.ts";
import { command, query } from "../remote-functions.ts";
import {
	assetFields,
	assetSql,
	assetView,
	componentsByUnit,
	withAssetJoins,
	yearStateSql,
} from "../server/assets.ts";
import { answerPoint, completeChecklist, remarkChecklist, remarkPoint } from "../server/field.ts";
import { startChecklist } from "../server/start.ts";
import { assetList } from "./asset-list.ts";

/**
 * A page of the tenant's assets as the query says (see `assetList`), each with its customer, site,
 * where it stands this year and its components, and how many match.
 */
export const getAssets = query(assetList.query, async (input) => {
	const state = yearStateSql();
	const plan = planList(assetSql(state), input);
	const [rows, rowCount] = await Promise.all([
		plan.paged(withAssetJoins(db.select(assetFields(state)).from(equipment).$dynamic())),
		plan.count(),
	]);
	const components = await componentsByUnit(rows.map((row) => row.id));
	return {
		rows: rows.map((row) => ({ ...row, components: components.get(row.id) ?? [] })),
		rowCount,
		query: input,
		key: queryKey(input),
	};
});

/**
 * How many assets match the search and the other filters, by where they stand this year and by
 * customer (with the customers' names, by name).
 */
export const getAssetFacets = query(assetList.where, async (where) => {
	const state = yearStateSql();
	const facets = await planList(assetSql(state), where).facets({
		thisYear: state,
		customer: customer.code,
	});
	const codes = Object.keys(facets.customer);
	const names = codes.length
		? await db
				.select({ code: customer.code, name: customer.name })
				.from(customer)
				.where(and(inList(customer.code, codes), inTenant(customer)))
		: [];
	return {
		thisYear: facets.thisYear,
		customers: names
			.map((found) => ({ ...found, count: facets.customer[found.code] ?? 0 }))
			.toSorted((a, b) => a.name.localeCompare(b.name)),
	};
});

/** The tenant's unit `serialNumber` with its template, components and checklists (or a 404). */
export const getAsset = query(v.string(), (serialNumber) => assetView(serialNumber));

/**
 * The scores of the tenant's unit `serialNumber`'s component `componentId`, newest first: a 404
 * for a unit that isn't the tenant's or a component that isn't the unit's.
 */
export const getComponentScores = query(
	v.object({ serialNumber: v.string(), componentId: v.pipe(v.number(), v.integer()) }),
	async ({ serialNumber, componentId }) => {
		const [unit] = await db
			.select({ id: equipment.id })
			.from(equipment)
			.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
		if (!unit) error(404, m.checklists_equipment_not_found({ serial: serialNumber }));
		const own = (await componentsByUnit([unit.id])).get(unit.id) ?? [];
		if (!own.some((part) => part.id === componentId))
			error(404, m.checklists_component_not_found());
		return (await collect(componentScores, { equipmentId: unit.id, componentId })).flat();
	},
);

/** The page's queries the client asked to have refreshed after a change. */
const refreshPage = () => refreshRequested(getAssets, getAssetFacets, getAsset, getComponentScores);

/**
 * Starts the tenant's unit's inspection or maintenance: opens its open order of that kind, or makes
 * one (see `startChecklist()`). Answers the order's number, its checklist and whether it's new.
 */
export const startOrder = command(
	v.object({ serialNumber: v.string(), kind: v.picklist(checklistKinds) }),
	async ({ serialNumber, kind }) => {
		const started = await startChecklist(serialNumber, kind);
		await refreshPage();
		return started;
	},
);

/** Gives a point of one of the tenant's draft checklists on an open order a result, for the engineer. */
export const officeAnswer = command(answerSchema, async (input) => {
	await answerPoint("office", input.id, input.result);
});

/** Says what's wrong with a point of one of the tenant's draft checklists, for the engineer. */
export const officeRemarkOn = command(pointRemarkSchema, async (input) => {
	await remarkPoint("office", input.id, input.remark);
});

/** The general remark for the customer on one of the tenant's draft checklists. */
export const officeRemarkForCustomer = command(remarksSchema, async (input) => {
	await remarkChecklist("office", input.id, input.remarks);
});

/**
 * Completes one of the tenant's draft checklists on an open order, for the engineer, once every
 * point is answered: by the member, in the office. Refreshes the page's queries it was asked to.
 */
export const officeComplete = command(checklistIdSchema, async (input) => {
	await completeChecklist("office", input.id);
	await refreshPage();
});
