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

export const checklistSubjects: Record<string, SubjectType> = {
	checklistTemplate: {
		noun: m.checklists_activity_subject_template,
		href: ({ id }) => resolve("/(app)/(modules)/checklists/templates/[id]", { id: String(id) }),
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
	/** A point of a template, by its text, logged with its template as its parent. */
	checklistTemplateItem: {
		noun: m.checklists_activity_subject_point,
		fields: {
			group: { label: m.checklists_field_group },
			text: { label: m.checklists_field_text },
			position: { label: m.checklists_field_place, format: place },
		},
	},
};
