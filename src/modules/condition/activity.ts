/** How the activity log reads for the condition module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatNumber, formatOnOff } from "#lib/i18n/index.ts";

/** Recording a unit's condition, as a sentence. */
export const conditionActions = {
	recorded: m.condition_activity_action_recorded,
} satisfies Record<string, Sentence>;

/**
 * A condition's label in the log: its unit's serial number, its component's number (of a
 * component's condition) and the score.
 */
export const conditionLabel = (record: {
	serialNumber: string;
	component?: string;
	score: number;
}) => [record.serialNumber, record.component, `${record.score}%`].filter(Boolean).join(" · ");

/** A component's label in the log: its unit's serial number, its number and its name. */
export const componentLabel = (record: { serialNumber: string; number: string; name: string }) =>
	`${record.serialNumber} · ${record.number} · ${record.name}`;

/** A score in percent. */
const percent = (value: unknown) => `${formatNumber(Number(value))}%`;

export const conditionSubjects = {
	/** A unit's condition, logged with its unit as its parent; it's on the unit's page. */
	unitCondition: {
		noun: m.condition_activity_subject,
		onParentPage: true,
		fields: {
			score: { label: m.condition_field_score, format: percent },
			advice: { label: m.condition_field_advice },
		},
	},
	/** A unit's component, logged with its unit as its parent; it's on the unit's page. */
	component: {
		noun: m.condition_activity_subject_component,
		onParentPage: true,
		fields: {
			name: { label: m.condition_field_component_name },
			article: { label: m.condition_field_article },
			checkpoints: { label: m.condition_field_checkpoints },
			position: { label: m.condition_field_position },
		},
	},
	/** The organization's condition settings; they have no label, so they read as their noun. */
	condition_settings: {
		noun: m.condition_activity_subject_settings,
		href: () => resolve("/(app)/(modules)/condition/settings"),
		fields: {
			criticalBelow: { label: m.condition_critical_below, format: percent },
			attentionBelow: { label: m.condition_attention_below, format: percent },
			autoPlan: { label: m.condition_auto_plan, format: formatOnOff },
		},
	},
} satisfies Record<string, SubjectType>;
