/** How the activity log reads for the parts shop's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatCents } from "#lib/i18n/index.ts";

import { shopLabels } from "./labels.ts";

/** The shop's verbs in the log (see `actionVerbs` in `#lib/activity/subjects.ts`). */
export const shopActions = {
	placed: m.shop_action_placed,
} satisfies Record<string, Sentence>;

export const shopSubjects = {
	/** A customer's order in the shop, by its number. */
	shop_order: {
		noun: m.shop_activity_subject_order,
		href: ({ label }) => resolve("/(app)/(modules)/parts-shop/orders/[number]", { number: label }),
		fields: {
			status: {
				label: m.shop_field_status,
				format: (value) => shopLabels.labelOrValue("shopOrderStatus", String(value)),
			},
			total: { label: m.shop_field_total, format: (value) => formatCents(Number(value)) },
		},
	},
	/** A material in the shop, by its SKU. */
	shop_product: {
		noun: m.shop_activity_subject_product,
		href: () => resolve("/(app)/(modules)/parts-shop/products"),
		fields: {
			description: { label: m.shop_field_description },
			unit: {
				label: m.shop_field_unit,
				format: (value) => shopLabels.labelOrValue("productUnit", String(value)),
			},
			popular: { label: m.shop_field_popular, format: yesNo },
			creditEligible: { label: m.shop_field_credit_eligible, format: yesNo },
			onRequest: { label: m.shop_field_on_request, format: yesNo },
		},
	},
	/** A category of the shop, by its name. */
	shop_category: {
		noun: m.shop_activity_subject_category,
		href: () => resolve("/(app)/(modules)/parts-shop/settings"),
		fields: { name: { label: m.shop_field_name } },
	},
} satisfies Record<string, SubjectType>;

function yesNo(value: unknown) {
	return value ? m.shop_yes() : m.shop_no();
}
