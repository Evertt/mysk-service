/**
 * What the condition module tells the checklists module's work orders page about components
 * (`checklists.components`, `checklists.componentScores`, `checklists.componentSearch`, in its
 * `api/extensions.ts`): the components of the units it lists, with their latest score and the
 * points that check them, a component's history of scores, and the SQL its search finds a unit by
 * its components with.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { inTenant, sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";
import type { ComponentScore, UnitComponent } from "#modules/checklists/api/extensions.ts";

import { checkpointsOf } from "./components.ts";
import { conditionsOf } from "./conditions.ts";
import { component } from "./schema.ts";
import { componentScoreSql } from "./status-sql.ts";

/** `checklists.components`: the units' components in their order, with score and points. */
export async function componentsOfUnits({
	equipmentIds,
}: {
	equipmentIds: readonly number[];
}): Promise<UnitComponent[]> {
	if (!equipmentIds.length) return [];
	const parts = await db
		.select({
			id: component.id,
			equipmentId: component.equipmentId,
			number: component.number,
			name: component.name,
			score: componentScoreSql(),
		})
		.from(component)
		.where(and(inList(component.equipmentId, [...new Set(equipmentIds)]), inTenant(component)))
		.orderBy(asc(component.equipmentId), asc(component.position), asc(component.id));
	const points = await checkpointsOf(parts.map((part) => part.id));
	return parts.map((part) => ({ ...part, templateItemIds: points.get(part.id) ?? [] }));
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
		sameTenant(component, equipment),
		eq(component.equipmentId, equipment.id),
	)})`;
