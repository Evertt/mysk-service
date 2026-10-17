/** The translated names of the checklists module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { ChecklistKind, InspectionStatus, PointResult, YearState } from "./model.ts";

export const checklistLabels = defineLabels({
	checklistKind: {
		inspection: m.checklists_kind_inspection,
		maintenance: m.checklists_kind_maintenance,
	} satisfies Labels<ChecklistKind>,
	pointResult: {
		ok: m.checklists_result_ok,
		nok: m.checklists_result_nok,
		na: m.checklists_result_na,
	} satisfies Labels<PointResult>,
	inspectionStatus: {
		valid: m.checklists_inspection_valid,
		expiring: m.checklists_inspection_expiring,
		expired: m.checklists_inspection_expired,
		rejected: m.checklists_inspection_rejected,
		none: m.checklists_inspection_none,
	} satisfies Labels<InspectionStatus>,
	yearState: {
		done: m.checklists_year_done,
		open: m.checklists_year_open,
		none: m.checklists_year_none,
	} satisfies Labels<YearState>,
});
