/** How the activity log reads for the maintenance module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { SubjectType } from "#lib/activity/index.ts";
import { formatStoredDay, labelOrValue } from "#lib/i18n/index.ts";

/** A plan's label in the log: its unit's serial number and its description. */
export const planLabel = (plan: { serialNumber: string; description: string }) =>
	`${plan.serialNumber} · ${plan.description}`;

/** The unit's serial number in a plan's label. */
const serialOf = (label: string) => label.split(" · ")[0];

export const maintenanceSubjects: Record<string, SubjectType> = {
	maintenancePlan: {
		noun: m.maintenance_activity_subject,
		// A plan has no page of its own: it's on its unit's.
		href: ({ label }) => resolve("/(app)/equipment/[serial]", { serial: serialOf(label) }),
		fields: {
			orderType: {
				label: m.maintenance_field_order_type,
				format: (value) => labelOrValue("orderType", String(value)),
			},
			intervalMonths: {
				label: m.maintenance_field_interval,
				format: (value) => m.maintenance_every_months({ count: Number(value) }),
			},
			nextDueOn: {
				label: m.maintenance_field_next_due,
				format: formatStoredDay,
			},
			paused: {
				label: m.maintenance_field_paused,
				format: (value) => (value ? m.maintenance_paused() : m.maintenance_active()),
			},
			lastOrder: { label: m.maintenance_field_last_order },
		},
	},
};
