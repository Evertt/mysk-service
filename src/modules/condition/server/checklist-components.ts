/**
 * What the condition module tells the checklists module's work orders page about components
 * (`checklists.components`, `checklists.componentScores`, `checklists.componentSearch`, in its
 * `api/extensions.ts`): the components of the units it lists, with their latest score and the
 * points that check them, a component's history of scores, and the SQL its search finds a unit by
 * its components with.
 */
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import type { ComponentScore, UnitComponent } from "#modules/checklists/api/extensions.ts";

import { conditionsOf } from "./conditions.ts";
import { component, componentCheckpoint, unitCondition } from "./schema.ts";

/** `checklists.components`: the units' components in their order, with score and points. */
export async function componentsOfUnits({
	equipmentIds,
}: {
	equipmentIds: readonly number[];
}): Promise<UnitComponent[]> {
	if (!equipmentIds.length) return [];
	const score = sql<number | null>`(select ${unitCondition.score} from ${unitCondition} where ${and(
		eq(unitCondition.organizationId, component.organizationId),
		eq(unitCondition.componentId, component.id),
	)} order by ${desc(unitCondition.recordedAt)}, ${desc(unitCondition.id)} limit 1)`.mapWith(
		(value: number | null) => (value === null ? null : Number(value)),
	);
	const parts = await db
		.select({
			id: component.id,
			equipmentId: component.equipmentId,
			number: component.number,
			name: component.name,
			score,
		})
		.from(component)
		.where(and(inList(component.equipmentId, [...new Set(equipmentIds)]), inTenant(component)))
		.orderBy(asc(component.equipmentId), asc(component.position), asc(component.id));
	if (!parts.length) return [];
	const links = await db
		.select({
			componentId: componentCheckpoint.componentId,
			templateItemId: componentCheckpoint.templateItemId,
		})
		.from(componentCheckpoint)
		.where(
			and(
				inList(
					componentCheckpoint.componentId,
					parts.map((part) => part.id),
				),
				inTenant(componentCheckpoint),
			),
		);
	const byComponent = Map.groupBy(links, (link) => link.componentId);
	return parts.map((part) => ({
		...part,
		templateItemIds: (byComponent.get(part.id) ?? []).map((link) => link.templateItemId),
	}));
}

/** `checklists.componentScores`: the unit's component's scores, newest first. */
export async function componentScoresOf({
	equipmentId,
	componentId,
}: {
	equipmentId: number;
	componentId: number;
}): Promise<ComponentScore[]> {
	const found = await conditionsOf(equipmentId, componentId);
	return found.map((row) => ({
		id: row.id,
		score: row.score,
		at: row.recordedAt,
		source: row.source,
		order: row.order,
		by: row.by,
	}));
}

/**
 * `checklists.componentSearch`: the unit's components' numbers and names, as one text, correlated on
 * the unit (and its tenant), binding no parameters.
 */
export const componentSearchText = () =>
	sql<
		string | null
	>`(select group_concat(${component.number} || ' ' || ${component.name}, ' ') from ${component} where ${and(
		eq(component.organizationId, equipment.organizationId),
		eq(component.equipmentId, equipment.id),
	)})`;
