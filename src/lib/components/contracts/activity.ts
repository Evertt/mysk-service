/** How the activity log reads for the contracts module's records (see `#lib/activity.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity.ts`: it imports the modules, and so this file, in turn.
import type { SubjectType } from "#lib/activity.js";
import { formatCents, formatDate } from "#lib/format.js";
import { labelOrValue } from "#lib/i18n/labels.js";
import { m } from "#lib/paraglide/messages.js";

const day = (value: unknown) => formatDate(new Date(String(value)));

export const contractSubjects: Record<string, SubjectType> = {
	contract: {
		noun: m.activity_subject_contract,
		href: ({ label }) => resolve("/(app)/contracts/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			level: { format: (value) => labelOrValue("contractLevel", String(value)) },
			startsOn: { format: day },
			endsOn: { format: day },
			monthlyFee: { format: (value) => formatCents(Number(value)) },
			responseHours: {
				format: (value) => m.common_count_hours_short({ count: Number(value) }),
			},
			equipmentIds: { label: m.activity_field_covered_equipment, ref: "equipment" },
		},
	},
};
