/** How the activity log reads for the materials module's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatCents, formatNumber } from "#lib/i18n/index.ts";

import { materialLabels } from "./labels.ts";

const unit = (value: unknown) => materialLabels.labelOrValue("materialUnit", String(value));

/** What the user did to a material's stock, as a sentence per verb (see `actionVerbs`). */
export const materialActions = {
	stock_received: m.materials_activity_action_stock_received,
	stock_adjusted: m.materials_activity_action_stock_adjusted,
} satisfies Record<string, Sentence>;

export const materialSubjects = {
	material: {
		noun: m.materials_activity_subject,
		href: ({ label }) => resolve("/(app)/(modules)/materials/[sku]", { sku: label }),
		fields: {
			sku: { label: m.materials_activity_field_sku },
			unit: { label: m.materials_activity_field_unit, format: unit },
			unitPrice: {
				label: m.materials_activity_field_unit_price,
				format: (value) => formatCents(Number(value)),
			},
			stock: {
				label: m.materials_activity_field_stock,
				format: (value) => formatNumber(Number(value)),
			},
		},
	},
	/** An order's materials, told apart by material: the subject's id is the material's. */
	order_line: {
		noun: m.materials_activity_subject_order_line,
		fields: {
			quantity: {
				label: m.materials_activity_field_quantity,
				format: (value) => formatNumber(Number(value)),
			},
		},
	},
} satisfies Record<string, SubjectType>;
