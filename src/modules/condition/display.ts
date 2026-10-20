/**
 * How the conditions show: a status's badge tone and what it means (the Connect page's legend), and
 * a score's colour by its band (rose, amber, emerald). Isomorphic.
 */
import { type BadgeDisplay, formatNumber } from "#lib/i18n/index.ts";

import { conditionLabels } from "./labels.ts";
import {
	PLAN_WITHIN_WORKING_DAYS,
	type ScoreBand,
	type Thresholds,
	type UnitStatus,
} from "./model.ts";

/** Each status's translated `label` and badge tone. */
export const unitStatusDisplay = conditionLabels.withLabels("unitStatus", {
	critical: { tone: "danger" },
	attention: { tone: "warning" },
	planned: { tone: "info" },
	ok: { tone: "success" },
} satisfies Record<UnitStatus, BadgeDisplay>);

/** What a status means and asks for, as the legend says it ("Wat betekenen de statussen?"). */
export function statusMeaning(status: UnitStatus, thresholds: Thresholds): string {
	const values = {
		critical: formatNumber(thresholds.critical),
		attention: formatNumber(thresholds.attention),
		days: formatNumber(PLAN_WITHIN_WORKING_DAYS),
	};
	switch (status) {
		case "critical":
			return m.condition_legend_critical(values);
		case "attention":
			return m.condition_legend_attention(values);
		case "planned":
			return m.condition_legend_planned();
		case "ok":
			return m.condition_legend_ok();
	}
}

/** The bar's colour by a score's band: below 40 rose, below 70 amber, else emerald (by default). */
export const bandColours: Record<ScoreBand, string> = {
	low: "bg-rose-500",
	fair: "bg-amber-500",
	good: "bg-emerald-500",
};

/** The score's text colour by its band. */
export const bandText: Record<ScoreBand, string> = {
	low: "text-rose-700 dark:text-rose-400",
	fair: "text-amber-700 dark:text-amber-400",
	good: "text-emerald-700 dark:text-emerald-400",
};
