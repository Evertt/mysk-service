/**
 * A unit's components ("onderdelen"): added, changed, removed and put in order by an office member
 * on the unit's page, each numbered (`OC-0001`), with its article (a material, with the materials
 * module on, `condition.articles`) and the checklist points that check it (its unit's template's,
 * with checklists on, `condition.checkpoints`; by default its article's shop points,
 * `condition.articleCheckpoints`). Each change is made and logged in a transaction, against the
 * unit. Another tenant's unit or component is a 404, also by a tampered id; an article or a point
 * that isn't the tenant's (or the unit's) is refused.
 */
import { error, invalid } from "@sveltejs/kit";
import { and, asc, eq, sql } from "drizzle-orm";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import { collect } from "#lib/server/extensions.ts";
import { type NumberTarget, nextNumber } from "#lib/server/numbering.ts";
import type { PointArticle, UnitPoint } from "#modules/checklists/api/extensions.ts";

import { componentLabel } from "../activity.ts";
import { type Article, articleCheckpoints, articles, checkpoints } from "../api/extensions.ts";
import { componentNumber, COMPONENTS_MAX } from "../model.ts";
import { component, componentCheckpoint } from "./schema.ts";

/** Components are numbered per tenant, `OC-0001`. */
const componentNumbers: NumberTarget = {
	format: componentNumber,
	table: component,
	column: component.number,
};

/** What's saved of a component: its name, its article (none for none) and the points that check it. */
export interface ComponentInput {
	name: string;
	materialId: number | null;
	checkpointIds: number[];
}

/** The tenant's articles with `ids`, by id (none while it hasn't materials). */
export async function articlesById(ids: readonly number[]): Promise<Map<number, Article>> {
	const unique = [...new Set(ids)];
	if (!unique.length) return new Map();
	const found = (await collect(articles, { ids: unique })).flat();
	return new Map(found.map((article) => [article.id, article]));
}

/** The tenant's unit `serialNumber`, in `tx`, or a 404. */
async function unitOf(tx: Transaction | typeof db, serialNumber: string) {
	const [unit] = await tx
		.select({ id: equipment.id, serialNumber: equipment.serialNumber })
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.condition_unit_not_found({ serial: serialNumber }));
	return unit;
}

/** The tenant's component `id` with its unit and its points, in `tx`, or a 404. */
async function componentOf(tx: Transaction, id: number) {
	const [found] = await tx
		.select({
			id: component.id,
			number: component.number,
			name: component.name,
			materialId: component.materialId,
			position: component.position,
			unit: { id: equipment.id, serialNumber: equipment.serialNumber },
		})
		.from(component)
		.innerJoin(
			equipment,
			and(
				eq(equipment.organizationId, component.organizationId),
				eq(equipment.id, component.equipmentId),
			),
		)
		.where(idInTenant(component, id));
	if (!found) error(404, m.condition_component_not_found());
	const points = await tx
		.select({ id: componentCheckpoint.templateItemId })
		.from(componentCheckpoint)
		.where(and(eq(componentCheckpoint.componentId, id), inTenant(componentCheckpoint)));
	return { ...found, checkpointIds: points.map((point) => point.id).sort((a, b) => a - b) };
}

/**
 * The input as it's saved: its article one of the tenant's (a 400 otherwise), and its points the
 * unit's (its template's, or ones it `kept`; a 400 otherwise). A new component (`fresh`) without
 * points gets its article's shop points, those the unit can be checked by. While the tenant hasn't
 * checklists, which offers the points, the form has none to give: the component keeps the ones it
 * has (a new one none), so switching checklists off for a while loses none of them.
 */
async function checked(
	equipmentId: number,
	input: ComponentInput,
	{ fresh, kept = [] }: { fresh: boolean; kept?: readonly number[] },
) {
	const article =
		input.materialId === null
			? null
			: (await articlesById([input.materialId])).get(input.materialId);
	if (article === undefined) invalid(m.condition_component_article_not_found());
	if (!currentTenant().modules.includes("checklists")) {
		return { article, checkpointIds: [...kept].sort((a, b) => a - b) };
	}
	const offered = (await collect(checkpoints, { equipmentId, ids: [...kept] })).flat();
	const allowed = new Set(offered.map((point) => point.id));
	let checkpointIds = [...new Set(input.checkpointIds)];
	if (checkpointIds.some((id) => !allowed.has(id))) {
		invalid(m.condition_component_checkpoint_not_found());
	}
	if (fresh && !checkpointIds.length && article) {
		const shop = (await collect(articleCheckpoints, { materialIds: [article.id] })).flat();
		checkpointIds = shop
			.flatMap((each) => each.templateItemIds)
			.filter((id, i, all) => allowed.has(id) && all.indexOf(id) === i);
	}
	return { article, checkpointIds: checkpointIds.sort((a, b) => a - b) };
}

/** What's logged of a component: its name, its article's SKU and how many points check it. */
const logged = (name: string, article: Article | null, checkpointIds: readonly number[]) => ({
	name,
	article: article?.sku ?? null,
	checkpoints: checkpointIds.length,
});

/** Sets the points that check the component `id`, in `tx`. */
async function setCheckpoints(tx: Transaction, id: number, checkpointIds: readonly number[]) {
	await tx
		.delete(componentCheckpoint)
		.where(and(eq(componentCheckpoint.componentId, id), inTenant(componentCheckpoint)));
	await insertRows(
		tx,
		componentCheckpoint,
		checkpointIds.map((templateItemId) => ({
			organizationId: currentTenant().organizationId,
			componentId: id,
			templateItemId,
		})),
	);
}

/** Adds a component to the tenant's unit `serialNumber`, last; returns its number. */
export function addComponent(serialNumber: string, input: ComponentInput) {
	return db.transaction(async (tx) => {
		const unit = await unitOf(tx, serialNumber);
		const [{ count, last }] = await tx
			.select({
				count: sql<number>`count(*)`.mapWith(Number),
				last: sql<number | null>`max(${component.position})`,
			})
			.from(component)
			.where(and(eq(component.equipmentId, unit.id), inTenant(component)));
		if (count >= COMPONENTS_MAX) invalid(m.condition_components_max({ max: COMPONENTS_MAX }));
		const { article, checkpointIds } = await checked(unit.id, input, { fresh: true });
		const number = await nextNumber(tx, componentNumbers);
		const [made] = await tx
			.insert(component)
			.values({
				organizationId: currentTenant().organizationId,
				equipmentId: unit.id,
				number,
				name: input.name,
				materialId: article?.id ?? null,
				position: last === null ? 0 : Number(last) + 1,
			})
			.returning({ id: component.id });
		await setCheckpoints(tx, made.id, checkpointIds);
		await recordActivity(tx, {
			action: "created",
			subject: {
				type: "component",
				id: made.id,
				label: componentLabel({ serialNumber: unit.serialNumber, number, name: input.name }),
			},
			parent: { type: "equipment", id: unit.id, label: unit.serialNumber },
			after: logged(input.name, article, checkpointIds),
		});
		return { number, serialNumber: unit.serialNumber };
	});
}

/** Changes the tenant's component `id`: its name, article and points (with checklists on). */
export function changeComponent(id: number, input: ComponentInput) {
	return db.transaction(async (tx) => {
		const found = await componentOf(tx, id);
		const { article, checkpointIds } = await checked(found.unit.id, input, {
			fresh: false,
			kept: found.checkpointIds,
		});
		await tx
			.update(component)
			.set({ name: input.name, materialId: article?.id ?? null })
			.where(idInTenant(component, id));
		await setCheckpoints(tx, id, checkpointIds);
		const before = (await articlesById(found.materialId === null ? [] : [found.materialId])).get(
			found.materialId ?? 0,
		);
		await recordActivity(tx, {
			action: "updated",
			subject: {
				type: "component",
				id,
				label: componentLabel({
					serialNumber: found.unit.serialNumber,
					number: found.number,
					name: input.name,
				}),
			},
			parent: { type: "equipment", id: found.unit.id, label: found.unit.serialNumber },
			before: logged(found.name, before ?? null, found.checkpointIds),
			after: logged(input.name, article, checkpointIds),
		});
		return { serialNumber: found.unit.serialNumber };
	});
}

/** Removes the tenant's component `id`, with its points and conditions. */
export function removeComponent(id: number) {
	return db.transaction(async (tx) => {
		const found = await componentOf(tx, id);
		await tx.delete(component).where(idInTenant(component, id));
		await recordActivity(tx, {
			action: "deleted",
			subject: {
				type: "component",
				id,
				label: componentLabel({
					serialNumber: found.unit.serialNumber,
					number: found.number,
					name: found.name,
				}),
			},
			parent: { type: "equipment", id: found.unit.id, label: found.unit.serialNumber },
		});
		return { serialNumber: found.unit.serialNumber };
	});
}

/**
 * Moves the tenant's component `id` one place up or down among its unit's components; nothing at
 * the edge. Their places are renumbered from 0.
 */
export function moveComponent(id: number, direction: "up" | "down") {
	return db.transaction(async (tx) => {
		const found = await componentOf(tx, id);
		const siblings = await tx
			.select({ id: component.id, position: component.position })
			.from(component)
			.where(and(eq(component.equipmentId, found.unit.id), inTenant(component)))
			.orderBy(asc(component.position), asc(component.id));
		const at = siblings.findIndex((each) => each.id === id);
		const to = direction === "up" ? at - 1 : at + 1;
		if (to < 0 || to >= siblings.length) return { serialNumber: found.unit.serialNumber };
		[siblings[at], siblings[to]] = [siblings[to], siblings[at]];
		for (const [position, each] of siblings.entries()) {
			if (each.position !== position) {
				await tx.update(component).set({ position }).where(idInTenant(component, each.id));
			}
		}
		await recordActivity(tx, {
			action: "updated",
			subject: {
				type: "component",
				id,
				label: componentLabel({
					serialNumber: found.unit.serialNumber,
					number: found.number,
					name: found.name,
				}),
			},
			parent: { type: "equipment", id: found.unit.id, label: found.unit.serialNumber },
			before: { position: found.position + 1 },
			after: { position: to + 1 },
		});
		return { serialNumber: found.unit.serialNumber };
	});
}

/**
 * `checklists.pointArticles`: the articles of the units' components that the points check, a
 * point and unit each (the first component's, in their order, if several).
 */
export async function componentArticles({
	points,
}: {
	points: readonly UnitPoint[];
}): Promise<PointArticle[]> {
	if (!points.length) return [];
	const found = await db
		.select({
			equipmentId: component.equipmentId,
			templateItemId: componentCheckpoint.templateItemId,
			materialId: component.materialId,
		})
		.from(componentCheckpoint)
		.innerJoin(
			component,
			and(
				eq(component.organizationId, componentCheckpoint.organizationId),
				eq(component.id, componentCheckpoint.componentId),
			),
		)
		.where(
			and(
				inList(component.equipmentId, [...new Set(points.map((point) => point.equipmentId))]),
				inList(componentCheckpoint.templateItemId, [
					...new Set(points.map((point) => point.templateItemId)),
				]),
				sql`${component.materialId} is not null`,
				inTenant(componentCheckpoint),
			),
		)
		.orderBy(asc(component.position), asc(component.id));
	return points.flatMap((point) => {
		const match = found.find(
			(row) => row.equipmentId === point.equipmentId && row.templateItemId === point.templateItemId,
		);
		return match?.materialId ? [{ ...point, materialId: match.materialId }] : [];
	});
}
