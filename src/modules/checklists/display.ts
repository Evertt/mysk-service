/**
 * How the checklists show: the badge tone of a unit's inspection status and of a checklist's
 * outcome, and a checklist's outcome in words ("Approved", "2 rejected"). Isomorphic.
 */
import type { BadgeTone } from "#lib/components/ui/badge/index.ts";

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
export const inspectionTones: Record<InspectionStatus, BadgeTone> = {
	valid: "success",
	expiring: "warning",
	rejected: "warning",
	expired: "danger",
	none: "neutral",
};

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
