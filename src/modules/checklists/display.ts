/**
 * How the checklists show: the badge tone of a unit's inspection status and of a checklist's
 * outcome, a checklist's outcome in words ("Approved", "2 rejected") and a picked result's colours.
 * Isomorphic.
 */
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";
import type { BadgeDisplay } from "#lib/i18n/index.ts";

import { checklistLabels } from "./labels.ts";
import {
	type ChecklistStatus,
	type InspectionStatus,
	type PointResult,
	rejections,
} from "./model.ts";

/**
 * The tone of a unit's inspection status: valid is fine, expiring and rejected need attention
 * (phase 2's "Aandacht"), expired is critical ("Kritiek").
 */
export const inspectionStatusDisplay = checklistLabels.withLabels("inspectionStatus", {
	valid: { tone: "success" },
	expiring: { tone: "warning" },
	rejected: { tone: "warning" },
	expired: { tone: "danger" },
	none: { tone: "neutral" },
} satisfies Record<InspectionStatus, BadgeDisplay>);

/** A checklist's outcome: a draft is open, a completed one approved or with rejected points. */
export function outcome(checklist: {
	status: ChecklistStatus;
	results: readonly { result: PointResult | null }[];
}): { label: string; tone: BadgeTone } {
	if (checklist.status === "draft") return { label: m.checklists_status_draft(), tone: "info" };
	const count = rejections(checklist.results);
	return count
		? { label: m.checklists_rejected_count({ count }), tone: "warning" }
		: { label: m.checklists_approved(), tone: "success" };
}

/**
 * A point's result button once picked, strong as the mockup's (green, red, grey): over the outline
 * button's own background and hover.
 */
export const pickedResultClasses: Record<PointResult, string> = {
	ok: "aria-pressed:border-success! aria-pressed:bg-success! aria-pressed:text-success-foreground!",
	nok: "aria-pressed:border-destructive! aria-pressed:bg-destructive! aria-pressed:text-white!",
	na: "aria-pressed:border-muted-foreground! aria-pressed:bg-muted-foreground! aria-pressed:text-background!",
};

/**
 * Who completed a checklist, as the pages name them: the engineer, or the office member who filled
 * it in on their behalf, e.g. "Anna de Vries (office)", or "the office" where it doesn't say who
 * (`office: true`, as customers read it); none when it isn't known.
 */
export const completerName = (checklist: {
	engineer: string | null;
	office: string | boolean | null;
}) =>
	checklist.engineer ??
	(checklist.office === true
		? m.checklists_the_office()
		: checklist.office
			? m.checklists_by_office({ name: checklist.office })
			: null);
