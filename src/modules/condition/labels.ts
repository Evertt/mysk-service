/** The translated names of the condition module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { ConditionSource, UnitStatus } from "./model.ts";

export const conditionLabels = defineLabels({
	unitStatus: {
		critical: m.condition_status_critical,
		attention: m.condition_status_attention,
		planned: m.condition_status_planned,
		ok: m.condition_status_ok,
	} satisfies Labels<UnitStatus>,
	conditionSource: {
		checklist: m.condition_source_checklist,
		office: m.condition_source_office,
	} satisfies Labels<ConditionSource>,
});
