/** How the activity log reads for the partner programme's records (see `#lib/activity/subjects.ts`). */
import { resolve } from "$app/paths";

// Only types from `#lib/activity/subjects.ts`: it imports the modules, and so this file, in turn.
import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import { formatCents, formatStoredDay } from "#lib/i18n/index.ts";

import { formatCategory, formatTier } from "./display.ts";
import { partnerLabels } from "./labels.ts";
import type { CategoryRule, Tier } from "./model.ts";

/** The customer's code in a label that starts with it (`CUST-0001 · 2025`). */
const codeOf = (label: string) => label.split(" · ")[0];
const customerPage = ({ label }: { label: string }) =>
	resolve("/(app)/customers/[code]", { code: codeOf(label) });

/** The programme's verbs in the log (see `actionVerbs` in `#lib/activity/subjects.ts`). */
export const partnerActions = {
	finalised: m.partners_action_finalised,
	chosen: m.partners_action_chosen,
} satisfies Record<string, Sentence>;

export const partnerSubjects: Record<string, SubjectType> = {
	/** A customer accepted into the programme, by its code. */
	partner: {
		noun: m.partners_activity_subject_partner,
		href: customerPage,
		fields: { acceptedOn: { label: m.partners_field_accepted_on, format: formatStoredDay } },
	},
	/** A year's rules, by the year. */
	partner_programme_year: {
		noun: m.partners_activity_subject_year,
		href: ({ label }) =>
			resolve("/(app)/(modules)/partner-programme/years/[year]", { year: label }),
		fields: {
			tiers: { label: m.partners_field_tiers, format: (value) => formatTier(value as Tier) },
			categories: {
				label: m.partners_field_categories,
				format: (value) => formatCategory(value as CategoryRule),
			},
			creditValidYears: {
				label: m.partners_field_credit_valid,
				format: (value) => m.partners_valid_years({ count: Number(value) }),
			},
		},
	},
	/** An order's classification, by the order's number; logged against the order. */
	partner_classification: {
		noun: m.partners_activity_subject_classification,
		href: ({ label }) => resolve("/(app)/orders/[number]", { number: label }),
		fields: {
			category: {
				label: m.partners_field_category,
				format: (value) => partnerLabels.labelOrValue("revenueCategory", String(value)),
			},
			eligibility: {
				label: m.partners_field_eligibility,
				format: (value) => partnerLabels.labelOrValue("eligibility", String(value)),
			},
			share: { label: m.partners_field_share, format: (value) => `${Number(value)}%` },
		},
	},
	/** A partner's closed year, as `CUST-0001 · 2025`. */
	partner_bonus_year: { noun: m.partners_activity_subject_bonus_year, href: customerPage },
	/** An entry in a partner's wallet, by the customer's code. */
	partner_wallet_entry: {
		noun: m.partners_activity_subject_wallet_entry,
		href: customerPage,
		fields: {
			kind: {
				label: m.partners_field_kind,
				format: (value) => partnerLabels.labelOrValue("walletEntryKind", String(value)),
			},
			amount: { label: m.partners_field_amount, format: (value) => formatCents(Number(value)) },
		},
	},
};
