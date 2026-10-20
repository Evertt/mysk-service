/**
 * The condition module's columns in the equipment list (`equipment.list`,
 * `#lib/equipment/extensions.ts`): each unit's latest condition (a bar, filtered by its band) and
 * its status (worst first, filtered by status). Their SQL is in `../server/columns/`.
 */
import { oneOf } from "#lib/components/data-table/list-definition.ts";
import { listColumn } from "#lib/components/data-table/module-columns.ts";

import { conditionLabels } from "../labels.ts";
import { scoreBands, type ScoreFilter } from "../list/units-list.ts";
import { type UnitStatus, unitStatuses } from "../model.ts";
import ScoreCell from "../ui/score-cell.svelte";
import StatusCell from "../ui/status-cell.svelte";

/** A unit's latest score and its band, as the column shows it; none without one. */
export type ScoreValue = { score: number; band: "low" | "fair" | "good" } | null;

/** A unit's status and what's behind it, as the column shows it. */
export type StatusValue = { status: UnitStatus; concern: Exclude<UnitStatus, "planned"> };

const bandLabels: Record<ScoreFilter, () => string> = {
	low: m.condition_band_low,
	fair: m.condition_band_fair,
	good: m.condition_band_good,
	none: m.condition_band_none,
};

export const score = listColumn<ScoreValue, ScoreFilter>({
	id: "condition.score",
	param: "condition",
	label: m.condition_column_condition,
	sort: true,
	filter: oneOf(scoreBands),
	optionLabel: (value) => bandLabels[value](),
	cell: ScoreCell,
});

export const status = listColumn<StatusValue, UnitStatus>({
	id: "condition.status",
	param: "condition-status",
	label: m.condition_column_condition_status,
	sort: true,
	filter: oneOf(unitStatuses),
	optionLabel: (value) => conditionLabels.label("unitStatus", value),
	cell: StatusCell,
});

export default [score, status];
