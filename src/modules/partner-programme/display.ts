/** How the partner programme shows its amounts and rates (through `#lib/i18n/format.ts`). */
import { numberFormatter } from "#lib/i18n/index.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

import { partnerLabels } from "./labels.ts";
import type { CategoryRule, Tier } from "./model.ts";

const euros = numberFormatter({ style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const percent = numberFormatter({ style: "percent", maximumFractionDigits: 2 });

/** An amount in cents in whole euros, as the programme's figures read: `€200,000`, `€ 200.000`. */
export const formatEuros = (cents: number, locale?: Locale) =>
	euros(Math.round(cents / 100), locale);

/** A rate in basis points, e.g. `380` → `3.8%`; in Dutch `3,8%`. */
export const formatRate = (rate: number, locale?: Locale) => percent(rate / 10_000, locale);

/**
 * A level as the activity log lists it (the log shows a list's items one by one, joined): "BRONZE
 * from €50,000 (2.5% / 3%)".
 */
export const formatTier = (tier: Tier) =>
	m.partners_tier_summary({
		level: tier.level,
		threshold: formatEuros(tier.threshold),
		cash: formatRate(tier.cashRate),
		credit: formatRate(tier.creditRate),
	});

/** A category's rule as the activity log lists it. */
export const formatCategory = (rule: CategoryRule) =>
	m.partners_category_summary({
		category: partnerLabels.label("revenueCategory", rule.category),
		level: rule.level ? m.partners_rule_yes() : m.partners_rule_no(),
		cash: partnerLabels.label("categoryRule", rule.cash),
		credit: partnerLabels.label("categoryRule", rule.credit),
	});
