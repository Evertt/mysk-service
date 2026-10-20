/** How the partner programme shows its amounts and rates (through `#lib/i18n/format.ts`). */
import { formatPercent, formatWholeEuros } from "#lib/i18n/index.ts";
import type { Locale } from "#lib/paraglide/runtime.js";

import { partnerLabels } from "./labels.ts";
import type { CategoryRule, Progress, Tier } from "./model.ts";

/**
 * The way to the next level in whole euros: the revenue rounded down and what's left rounded up, so
 * it never reads as the threshold reached before `levelFor` gives the level (€49,999.50 is "€49,999
 * of €50,000" and "€1 to go", not "€50,000 of €50,000").
 */
export const formatProgress = (revenue: number, progress: Progress, locale?: Locale) => ({
	revenue: formatWholeEuros(revenue, { round: "floor", locale }),
	threshold: formatWholeEuros(progress.next.threshold, { locale }),
	remaining: formatWholeEuros(progress.remaining, { round: "ceil", locale }),
});

/**
 * A level as the activity log lists it (the log shows a list's items one by one, joined): "BRONZE
 * from €50,000 (2.5% / 3%)".
 */
export const formatTier = (tier: Tier) =>
	m.partners_tier_summary({
		level: tier.level,
		threshold: formatWholeEuros(tier.threshold),
		cash: formatPercent(tier.cashRate, { basis: "basisPoints" }),
		credit: formatPercent(tier.creditRate, { basis: "basisPoints" }),
	});

/** A category's rule as the activity log lists it. */
export const formatCategory = (rule: CategoryRule) =>
	m.partners_category_summary({
		category: partnerLabels.label("revenueCategory", rule.category),
		level: rule.level ? m.partners_enum_category_rule_yes() : m.partners_enum_category_rule_no(),
		cash: partnerLabels.label("categoryRule", rule.cash),
		credit: partnerLabels.label("categoryRule", rule.credit),
	});
