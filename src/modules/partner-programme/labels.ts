/** The translated names of the partner programme's enum values, see `#lib/i18n/labels.ts`. */
import { defineLabels, type Labels } from "#lib/i18n/index.ts";

import type {
	BonusForm,
	CategoryRuleValue,
	Eligibility,
	RevenueCategory,
	WalletEntryKind,
} from "./model.ts";

export const partnerLabels = defineLabels({
	revenueCategory: {
		maintenance_contracts: m.partners_category_maintenance_contracts,
		service_maintenance: m.partners_category_service_maintenance,
		regular_parts: m.partners_category_regular_parts,
		regular_orders: m.partners_category_regular_orders,
		projects_regular: m.partners_category_projects_regular,
		special_project_prices: m.partners_category_special_project_prices,
		tenders: m.partners_category_tenders,
	} satisfies Labels<RevenueCategory>,
	categoryRule: {
		yes: m.partners_rule_yes,
		no: m.partners_rule_no,
		by_agreement: m.partners_rule_by_agreement,
	} satisfies Labels<CategoryRuleValue>,
	eligibility: {
		full: m.partners_eligibility_full,
		partial: m.partners_eligibility_partial,
		level_only: m.partners_eligibility_level_only,
		excluded: m.partners_eligibility_excluded,
	} satisfies Labels<Eligibility>,
	bonusForm: {
		cash: m.partners_form_cash,
		credit: m.partners_form_credit,
	} satisfies Labels<BonusForm>,
	walletEntryKind: {
		award: m.partners_wallet_kind_award,
		spend: m.partners_wallet_kind_spend,
		reversal: m.partners_wallet_kind_reversal,
		expiry: m.partners_wallet_kind_expiry,
		adjustment: m.partners_wallet_kind_adjustment,
	} satisfies Labels<WalletEntryKind>,
});
