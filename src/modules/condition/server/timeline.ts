/**
 * The condition module's part of a unit's timeline (`equipment.timeline`) and figures
 * (`equipment.figures`): each condition of the unit as a whole measured ("Condition measured:
 * 3 · Redelijk, 2 defects"), with the photos of its defects for the office and the unit's engineers
 * (never a customer's contact: the access registry's `conditionPhoto` has no rule for them), and the
 * status it moved the unit to when it differs from the one before ("Needs attention, was OK"); and
 * the unit's current NEN 2767 score. Who may read the unit's conditions, as the registry says
 * (`unitCondition`: an engineer only on a unit of their own orders), gets them.
 */
import { and, asc, count, desc, eq, isNull, lte, sql } from "drizzle-orm";

import type { FiguresQuery, TimelineQuery } from "#lib/equipment/extensions.ts";
import {
	answerOf,
	type TimelineAnswer,
	type TimelineEntry,
	type TimelineFigure,
	type TimelinePhoto,
	type TimelineTone,
} from "#lib/equipment/index.ts";
import { visible } from "#lib/server/access/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { scoreText, unitStatusDisplay } from "../display.ts";
import { concernOf, scoreBand, type Thresholds } from "../model.ts";
import { conditionDefect, conditionDefectPhoto, unitCondition } from "./schema.ts";
import { thresholdsOf } from "./settings.ts";
import { conditionSql } from "./status-sql.ts";

/** A score's tone against the tenant's thresholds. */
const toneOf = (score: number, thresholds: Thresholds): TimelineTone => {
	const band = scoreBand(score, thresholds);
	return band === "low" ? "danger" : band === "fair" ? "warning" : "success";
};

/** What a condition alone asks of the unit: its score's and advice's concern. */
const concernAfter = (record: { score: number; advice: string | null }, thresholds: Thresholds) =>
	concernOf(
		{ score: record.score, advice: record.advice, inspection: null, planned: false },
		thresholds,
	);

/** The unit's conditions as a whole for a page of its timeline. */
export async function conditionTimeline(query: TimelineQuery): Promise<TimelineAnswer> {
	const readable = await visible("unitCondition", "read", query.viewer);
	if (!readable) return { entries: [], more: false };
	const photosReadable = await visible("conditionPhoto", "read", query.viewer);
	const rows = await db
		.select({
			id: unitCondition.id,
			score: unitCondition.score,
			advice: unitCondition.advice,
			recordedAt: unitCondition.recordedAt,
		})
		.from(unitCondition)
		.where(
			and(
				inTenant(unitCondition),
				eq(unitCondition.equipmentId, query.unit.id),
				isNull(unitCondition.componentId),
				readable,
				query.before ? lte(unitCondition.recordedAt, query.before.at) : undefined,
			),
		)
		.orderBy(desc(unitCondition.recordedAt), desc(unitCondition.id))
		// One more, for the status before the oldest of the page.
		.limit(query.limit + 2);
	if (!rows.length) return { entries: [], more: false };

	const ids = rows.map((row) => row.id);
	const [thresholds, defects, photos] = await Promise.all([
		thresholdsOf(),
		db
			.select({ conditionId: conditionDefect.conditionId, count: count() })
			.from(conditionDefect)
			.where(and(inTenant(conditionDefect), inList(conditionDefect.conditionId, ids)))
			.groupBy(conditionDefect.conditionId),
		photosReadable
			? db
					.select({ id: conditionDefectPhoto.id, conditionId: conditionDefect.conditionId })
					.from(conditionDefectPhoto)
					.innerJoin(
						conditionDefect,
						and(
							eq(conditionDefect.id, conditionDefectPhoto.defectId),
							eq(conditionDefect.organizationId, conditionDefectPhoto.organizationId),
						),
					)
					.where(
						and(
							inTenant(conditionDefectPhoto),
							inList(conditionDefect.conditionId, ids),
							photosReadable,
						),
					)
					.orderBy(asc(conditionDefect.position), asc(conditionDefectPhoto.position))
			: [],
	]);
	const defectsOf = new Map(defects.map((row) => [row.conditionId, row.count]));
	const photosOf = Map.groupBy(photos, (photo) => photo.conditionId);

	const entries = rows.slice(0, query.limit + 1).map((row, i): TimelineEntry => {
		const earlier = rows[i + 1];
		const now = concernAfter(row, thresholds);
		const was = earlier && concernAfter(earlier, thresholds);
		const found = defectsOf.get(row.id) ?? 0;
		const shown: TimelinePhoto[] = (photosOf.get(row.id) ?? []).map(({ id }) => ({
			id,
			src: `/condition/photos/${id}`,
		}));
		return {
			id: `condition:${row.id}`,
			at: row.recordedAt,
			kind: "condition.recorded",
			title: found
				? m.condition_timeline_measured_defects({
						score: scoreText(row.score),
						defects: m.condition_count_defects({ count: found }),
					})
				: m.condition_timeline_measured({ score: scoreText(row.score) }),
			detail:
				was && was !== now
					? m.condition_timeline_status({
							status: unitStatusDisplay[now].label,
							was: unitStatusDisplay[was].label,
						})
					: null,
			photos: shown,
			tone: toneOf(row.score, thresholds),
			icon: "condition",
		};
	});
	return answerOf(entries, query.before, query.limit, rows.length > query.limit + 1);
}

/** The unit's current score on NEN 2767's scale, for whoever reads its conditions. */
export async function conditionFigures(query: FiguresQuery): Promise<TimelineFigure[]> {
	const readable = await visible("unitCondition", "read", query.viewer);
	if (!readable) return [];
	const condition = conditionSql();
	const [found] = await db
		.select({
			score: condition.score,
			seen: sql<number>`exists (select 1 from ${unitCondition} where ${and(
				eq(unitCondition.equipmentId, equipment.id),
				readable,
			)})`.mapWith(Boolean),
		})
		.from(equipment)
		.where(and(inTenant(equipment), eq(equipment.id, query.unit.id)));
	if (!found?.seen || found.score === null) return [];
	const thresholds = await thresholdsOf();
	return [
		{
			key: "condition.score",
			label: m.condition_timeline_figure(),
			value: scoreText(found.score),
			tone: toneOf(found.score, thresholds),
		},
	];
}
