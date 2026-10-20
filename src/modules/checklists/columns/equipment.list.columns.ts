/**
 * The checklists module's column in the equipment list (`equipment.list`,
 * `#lib/equipment/extensions.ts`): each unit's inspection status (see `inspectionStatus()` in
 * `../model.ts`) with how long it's valid, sorted worst first, and filtered by status. Its SQL is
 * in `../server/columns/`.
 */
import { oneOf } from "#lib/components/data-table/list-definition.ts";
import { listColumn } from "#lib/components/data-table/module-columns.ts";

import { checklistLabels } from "../labels.ts";
import { type InspectionStatus, inspectionStatuses } from "../model.ts";
import InspectionCell from "../ui/inspection-cell.svelte";

/** A unit's latest completed inspection as the column shows it; none without one. */
export type InspectionValue = { status: InspectionStatus; until: string } | null;

export const inspection = listColumn<InspectionValue, InspectionStatus>({
	id: "checklists.inspection",
	param: "inspection",
	label: m.checklists_column_inspection,
	sort: true,
	filter: oneOf(inspectionStatuses),
	optionLabel: (value) => checklistLabels.label("inspectionStatus", value),
	cell: InspectionCell,
});

export default [inspection];
