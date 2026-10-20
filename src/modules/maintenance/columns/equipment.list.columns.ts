/**
 * The maintenance module's column in the equipment list (`equipment.list`,
 * `#lib/equipment/extensions.ts`): the earliest due date of the unit's active plans, sorted, and
 * filtered by overdue, due within 30 days, or no plan. Its SQL is in `../server/columns/`.
 */
import { oneOf } from "#lib/components/data-table/list-definition.ts";
import { listColumn } from "#lib/components/data-table/module-columns.ts";

import { maintenanceLabels } from "../labels.ts";
import { type NextDueBucket, nextDueBuckets } from "../model.ts";
import NextDue from "../ui/next-due.svelte";

export const nextMaintenance = listColumn<Temporal.PlainDate | null, NextDueBucket>({
	id: "maintenance.nextDue",
	param: "next-maintenance",
	label: m.maintenance_column_next_maintenance,
	sort: true,
	filter: oneOf(nextDueBuckets),
	optionLabel: (value) => maintenanceLabels.label("nextDueBucket", value),
	cell: NextDue,
});

export default [nextMaintenance];
