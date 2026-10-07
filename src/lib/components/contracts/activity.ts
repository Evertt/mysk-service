/** How the activity log reads for the contracts module's records (see `#lib/activity.ts`). */
import { resolve } from "$app/paths";

import type { SubjectType } from "#lib/activity.js";
import { formatCents, formatDate } from "#lib/format.js";

import { levels } from "./display.js";

export const contractSubjects: Record<string, SubjectType> = {
	contract: {
		noun: "contract",
		href: ({ label }) => resolve("/(app)/contracts/[number]", { number: label }),
		fields: {
			customerId: { ref: "customer" },
			level: { format: (value) => levels[value as keyof typeof levels]?.label ?? String(value) },
			startsOn: { label: "starts", format: (value) => formatDate(new Date(String(value))) },
			endsOn: { label: "ends", format: (value) => formatDate(new Date(String(value))) },
			monthlyFee: { format: (value) => formatCents(Number(value)) },
			responseHours: { label: "response time", format: (value) => `${String(value)} h` },
			equipmentIds: { label: "covered equipment", ref: "equipment" },
		},
	},
};
