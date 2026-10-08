/** How the activity log reads for the contracts module's records (see `#lib/activity.ts`). */
import { resolve } from "$app/paths";

import type { SubjectType } from "#lib/activity.js";
import { formatCents, formatDate } from "#lib/format.js";
import { m } from "#lib/paraglide/messages.js";

import { levels } from "./display.js";

export const contractSubjects: Record<string, SubjectType> = {
	contract: {
		// Getters, so they're translated when read.
		get noun() {
			return m.contracts_activity_noun();
		},
		href: ({ label }) => resolve("/(app)/contracts/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			level: { format: (value) => levels[value as keyof typeof levels]?.label ?? String(value) },
			startsOn: {
				get label() {
					return m.contracts_activity_starts();
				},
				format: (value) => formatDate(new Date(String(value))),
			},
			endsOn: {
				get label() {
					return m.contracts_activity_ends();
				},
				format: (value) => formatDate(new Date(String(value))),
			},
			monthlyFee: { format: (value) => formatCents(Number(value)) },
			responseHours: {
				get label() {
					return m.contracts_activity_response_time();
				},
				format: (value) => m.common_count_hours_short({ count: Number(value) }),
			},
			equipmentIds: {
				get label() {
					return m.contracts_activity_covered_equipment();
				},
				ref: "equipment",
			},
		},
	},
};
