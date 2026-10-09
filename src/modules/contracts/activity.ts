/** How the activity log reads for the contracts module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { SubjectType } from "#lib/activity";
import { formatCents, formatDate } from "#lib/i18n";

import { contractLabels } from "./labels.ts";

const day = (value: unknown) => formatDate(new Date(String(value)));

export const contractSubjects: Record<string, SubjectType> = {
	contract: {
		noun: m.contracts_activity_subject,
		href: ({ label }) => resolve("/(app)/contracts/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			level: {
				label: m.contracts_activity_field_level,
				format: (value) => contractLabels.labelOrValue("contractLevel", String(value)),
			},
			startsOn: { label: m.contracts_activity_field_starts_on, format: day },
			endsOn: { label: m.contracts_activity_field_ends_on, format: day },
			monthlyFee: {
				label: m.contracts_activity_field_monthly_fee,
				format: (value) => formatCents(Number(value)),
			},
			responseHours: {
				label: m.contracts_activity_field_response_hours,
				format: (value) => m.common_count_hours_short({ count: Number(value) }),
			},
			equipmentIds: { label: m.contracts_activity_field_covered_equipment, ref: "equipment" },
		},
	},
};
