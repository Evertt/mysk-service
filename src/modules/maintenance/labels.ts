/** The translated names of the maintenance module's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type { DueRange, NextDueBucket } from "./model.ts";

export const maintenanceLabels = defineLabels({
	dueRange: {
		overdue: m.maintenance_range_overdue,
		"30-days": m.maintenance_range_30_days,
		"90-days": m.maintenance_range_90_days,
	} satisfies Labels<DueRange>,
	nextDueBucket: {
		overdue: m.maintenance_bucket_overdue,
		soon: m.maintenance_bucket_soon,
		none: m.maintenance_bucket_none,
	} satisfies Labels<NextDueBucket>,
});
