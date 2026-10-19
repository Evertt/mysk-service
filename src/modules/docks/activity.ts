/** How the activity log reads for the docks module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";

/**
 * The rules' verbs in the log: a door open 40 minutes or more (the dock planner's notice), and one
 * open an hour or more (the escalation to a breakdown order).
 */
export const dockActions = {
	door_alert: m.docks_action_door_alert,
	door_escalated: m.docks_action_door_escalated,
} satisfies Record<string, Sentence>;

export const dockSubjects = {
	/** A dock position, by its code (`DOCK 05`); logged with its site's customer as the parent. */
	dock: {
		noun: m.docks_activity_subject_dock,
		href: () => resolve("/(app)/(modules)/docks"),
		fields: {
			code: { label: m.docks_field_code },
			position: { label: m.docks_field_position },
			scpCode: { label: m.docks_field_scp },
			keyId: { label: m.docks_field_key },
			keyStorageUnit: { label: m.docks_field_key_storage },
		},
	},
} satisfies Record<string, SubjectType>;
