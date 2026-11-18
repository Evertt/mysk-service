/**
 * The condition module's figures about customers' sites (`customers.siteSummary`): each site's units
 * by status (critical and needing attention as chips on its card, then planned and fine) and by
 * score on NEN 2767's scale, and with `units` each unit's score and its name, for the report. The
 * scores and statuses are the module's own (`conditionSql()`), of the units the viewer may read
 * (`visible("equipment")`, whose parts the conditions are).
 */
import { and, type SQL } from "drizzle-orm";

import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type {
	SiteFigure,
	SiteSummary,
	SiteSummaryQuery,
	UnitColumn,
} from "#lib/customers/extensions.ts";
import { formatNumber } from "#lib/i18n/index.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { scoreLabel, scoreText, unitStatusDisplay } from "../display.ts";
import { unitStatuses } from "../model.ts";
import { conditionScores } from "../nen2767.ts";
import { conditionSql } from "./status-sql.ts";

/** Where its section comes in the report: first. */
const PLACE = 10;

/** A score's band as a cell's tone. */
const bandTone: Record<string, BadgeTone | undefined> = {
	low: "danger",
	fair: "warning",
	good: "success",
};

export async function conditionSiteSummary({
	siteIds,
	units,
}: SiteSummaryQuery): Promise<SiteSummary> {
	const condition = conditionSql();
	const where: SQL = and(
		inTenant(equipment),
		await visibleOrNone("equipment"),
		inList(equipment.siteId, siteIds),
	)!;
	const rows = await db
		.select({
			id: equipment.id,
			siteId: equipment.siteId,
			score: condition.score,
			band: condition.band,
			status: condition.status,
		})
		.from(equipment)
		.where(where);

	const section = m.condition_site_section();
	const statusLabel = {
		critical: m.condition_site_critical(),
		attention: m.condition_site_attention(),
		planned: unitStatusDisplay.planned.label,
		ok: unitStatusDisplay.ok.label,
	};
	const chips = { critical: "danger", attention: "warning" } as const;
	const bySite = Map.groupBy(rows, (row) => row.siteId);
	const figures = new Map<number, SiteFigure[]>();
	for (const siteId of siteIds) {
		const own = bySite.get(siteId) ?? [];
		if (!own.length) continue;
		const count = (keep: (row: (typeof own)[number]) => boolean) => own.filter(keep).length;
		figures.set(siteId, [
			...unitStatuses.map((status): SiteFigure => ({
				id: `condition.${status}`,
				section,
				label: statusLabel[status],
				value: count((row) => row.status === status),
				place: PLACE,
				...(status === "critical" || status === "attention" ? { chip: chips[status] } : {}),
			})),
			...conditionScores.map((score): SiteFigure => ({
				id: `condition.score${score}`,
				section,
				label: m.condition_site_score({ score: formatNumber(score), label: scoreLabel(score) }),
				value: count((row) => row.score === score),
				place: PLACE,
			})),
			{
				id: "condition.noScore",
				section,
				label: m.condition_site_no_score(),
				value: count((row) => row.score === null),
				place: PLACE,
			},
		]);
	}

	const columns: UnitColumn[] = units
		? [
				{
					id: "condition.score",
					label: m.condition_site_column(),
					place: PLACE,
					cells: new Map(
						rows.flatMap((row) =>
							row.score === null
								? []
								: [[row.id, { text: scoreText(row.score), tone: bandTone[row.band] }]],
						),
					),
				},
			]
		: [];
	// A condition is logged with its unit as the parent, and planned work is the unit's orders.
	return { figures, columns, watches: ["equipment", "unitCondition", "component", "order"] };
}
