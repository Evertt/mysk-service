/**
 * The work orders page's remote functions, for every office member of a tenant with the module:
 * the list of assets and its filters' counts, an asset with its checklists, a component's scores,
 * starting a unit's inspection or maintenance ("Keuring 2026"), and filling a checklist in on the
 * engineer's behalf (a paper form brought back), by the same rules as the portal.
 */
import { error } from "@sveltejs/kit";
import * as v from "valibot";

import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { unitBySerial } from "#lib/equipment/server/index.ts";
import { recordId } from "#lib/schema.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipment } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";
import { customerFacet, planList, refreshRequested } from "#lib/server/lists/index.ts";

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
	// The chosen customer too, with 0 when the year's filter leaves none of theirs: else the select
	// would show "All customers" while the list shows no one's.
	const chosen = Object.fromEntries((where.filters.customer ?? []).map((code) => [code, 0]));
	return {
		thisYear: facets.thisYear,
		customers: await customerFacet({ ...chosen, ...facets.customer }),
	};
});

/** The tenant's unit `serialNumber` with its template, components and checklists (or a 404). */
export const getAsset = query(v.string(), (serialNumber) => assetView(serialNumber));

/**
 * The scores of the tenant's unit `serialNumber`'s component `componentId`, newest first: a 404
 * for a unit that isn't the tenant's or a component that isn't the unit's.
 */
export const getComponentScores = query(
	v.object({ serialNumber: v.string(), componentId: recordId() }),
	async ({ serialNumber, componentId }) => {
		const unit = await unitBySerial(serialNumber);
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
