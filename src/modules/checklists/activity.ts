/** How the activity log reads for the checklists module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatNumber } from "#lib/i18n/index.ts";

/** What a manager did to a template besides changing it, as a sentence per verb. */
export const checklistActions = {
	retired: m.checklists_activity_action_retired,
	restored: m.checklists_activity_action_restored,
} satisfies Record<string, Sentence>;

/** A place in an order, from 0 as stored, read from 1. */
const place = (value: unknown) => formatNumber(Number(value) + 1);

export const checklistSubjects = {
	checklistTemplate: {
		noun: m.checklists_activity_subject_template,
		href: ({ id }) => resolve("/(app)/(modules)/checklists/settings/[id]", { id: String(id) }),
		fields: {
			name: { label: m.checklists_field_name },
			norm: { label: m.checklists_field_norm },
			validityMonths: {
				label: m.checklists_field_validity,
				format: (value) => m.checklists_months({ count: Number(value) }),
			},
			categoryIds: { label: m.checklists_field_categories, ref: "category" },
			/** The order of its points' groups, when one is moved. */
			groups: { label: m.checklists_field_groups },
			position: { label: m.checklists_field_place, format: place },
		},
	},
	/**
	 * A unit's checklist on an order, by its template's name and the unit, logged with its order as
	 * its parent, on whose page it is: when the engineer completes it (with what it found as the
	 * entry's note, and the remark for the customer).
	 */
	checklist: {
		noun: m.checklists_activity_subject_checklist,
		onParentPage: true,
		fields: {
			remarks: { label: m.checklists_remarks },
			status: {
				label: m.checklists_field_status,
				format: (value) =>
					value === "completed" ? m.checklists_status_completed() : m.checklists_status_draft(),
			},
		},
	},
	/** A point of a template, by its text, logged with its template as its parent. */
	checklistTemplateItem: {
		noun: m.checklists_activity_subject_point,
		fields: {
			group: { label: m.checklists_field_group },
			text: { label: m.checklists_field_text },
			position: { label: m.checklists_field_place, format: place },
		},
	},
} satisfies Record<string, SubjectType>;
