/**
 * A unit's components, for their card on the unit's page: each with its article, the points that
 * check it, its latest condition and its status; and adding, changing, removing and ordering them.
 * Every office member may, as they may record conditions.
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { unitTitle } from "#lib/equipment/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";

import { articleCheckpoints, articles, checkpoints } from "./api/extensions.ts";
import { getUnitCondition } from "./condition.remote.ts";
import {
	componentIdSchema,
	componentSchema,
	moveComponentSchema,
} from "./form/component-schema.ts";
import { form, query } from "./remote-functions.ts";
import {
	addComponent,
	articlesById,
	changeComponent,
	moveComponent as moveOne,
	removeComponent as removeOne,
} from "./server/components.ts";
import { component, componentCheckpoint } from "./server/schema.ts";
import { thresholdsOf } from "./server/settings.ts";
import { componentSql, conditionSql } from "./server/status-sql.ts";

/**
 * The components of the tenant's unit `serialNumber` (or a 404), in their order, each with its
 * article, its points, its latest condition and its status; what they can be linked to (the
 * tenant's articles, with the points their shop products fix, and the unit's checklist points); and
 * which of the modules that offer those the tenant has.
 */
export const getUnitComponents = query(v.string(), async (serialNumber) => {
	const [unit] = await db
		.select({
			id: equipment.id,
			serialNumber: equipment.serialNumber,
			name: equipment.name,
			manufacturer: equipment.manufacturer,
			model: equipment.model,
		})
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.condition_unit_not_found({ serial: serialNumber }));
	const part = componentSql(conditionSql());
	const rows = await db
		.select({
			id: component.id,
			number: component.number,
			name: component.name,
			materialId: component.materialId,
			score: part.score,
			advice: part.advice,
			band: part.band,
			recordedAt: part.recordedAt,
			status: part.status,
			concern: part.concern,
		})
		.from(component)
		.innerJoin(
			equipment,
			and(
				eq(equipment.organizationId, component.organizationId),
				eq(equipment.id, component.equipmentId),
			),
		)
		.where(and(eq(component.equipmentId, unit.id), inTenant(component)))
		.orderBy(asc(component.position), asc(component.id));
	const links = rows.length
		? await db
				.select({
					componentId: componentCheckpoint.componentId,
					templateItemId: componentCheckpoint.templateItemId,
				})
				.from(componentCheckpoint)
				.where(
					and(
						inList(
							componentCheckpoint.componentId,
							rows.map((row) => row.id),
						),
						inTenant(componentCheckpoint),
					),
				)
		: [];
	const { modules } = currentTenant();
	const [offered, choices, thresholds] = await Promise.all([
		collect(checkpoints, {
			equipmentId: unit.id,
			ids: [...new Set(links.map((link) => link.templateItemId))],
		}),
		collect(articles, { ids: null }),
		thresholdsOf(),
	]);
	const articleList = choices.flat();
	const [shopPoints, linked] = await Promise.all([
		articleList.length
			? collect(articleCheckpoints, { materialIds: articleList.map((article) => article.id) })
			: [],
		// An article that isn't among the choices (there are more than are listed).
		articlesById(rows.flatMap((row) => row.materialId ?? [])),
	]);
	const hasChecklists = modules.includes("checklists");
	const pointIds = new Set(offered.flat().map((point) => point.id));
	const byComponent = Map.groupBy(links, (link) => link.componentId);
	return {
		unit: { id: unit.id, serialNumber: unit.serialNumber, title: unitTitle(unit) },
		components: rows.map((row) => ({
			...row,
			article: row.materialId === null ? null : (linked.get(row.materialId) ?? null),
			// Those of its points that are still a template's; all it has while checklists is off,
			// which offers none (and saving leaves them as they are, `changeComponent()`).
			checkpointIds: (byComponent.get(row.id) ?? [])
				.map((link) => link.templateItemId)
				.filter((id) => !hasChecklists || pointIds.has(id)),
		})),
		checkpoints: offered.flat(),
		articles: articleList,
		/** The points each article's shop product fixes: a new component's defaults. */
		articleCheckpoints: Object.fromEntries(
			shopPoints.flat().map((each) => [each.materialId, each.templateItemIds]),
		) as Record<number, number[]>,
		thresholds,
		has: { materials: modules.includes("materials"), checklists: hasChecklists },
	};
});

/** Refreshes what shows a unit's components: their card and the unit's condition card. */
function refreshUnit(serialNumber: string) {
	void getUnitComponents(serialNumber).refresh();
	void getUnitCondition(serialNumber).refresh();
}

/** Adds a component to a unit, or changes one (with its id). */
export const saveComponent = form(componentSchema, async ({ serialNumber, id, ...input }) => {
	const fields = { ...input, materialId: input.materialId ?? null };
	const saved =
		id === null ? await addComponent(serialNumber, fields) : await changeComponent(id, fields);
	refreshUnit(saved.serialNumber);
});

/** Removes a component, with its conditions. */
export const removeComponent = form(componentIdSchema, async ({ id }) => {
	const { serialNumber } = await removeOne(id);
	refreshUnit(serialNumber);
});

/** Moves a component one place up or down among its unit's. */
export const moveComponent = form(moveComponentSchema, async ({ id, direction }) => {
	const { serialNumber } = await moveOne(id, direction);
	void getUnitComponents(serialNumber).refresh();
});
