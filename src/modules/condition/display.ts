/**
 * How the conditions show: a status's badge tone and what it means (the Connect page's legend), a
 * score on NEN 2767's scale with its name and colour (1–3 greens and teal, 4 amber, 5 orange, 6
 * red, from the theme's tone tokens), and a defect's grade. Isomorphic.
 */
import { type BadgeDisplay, formatNumber } from "#lib/i18n/index.ts";

import { conditionLabels } from "./labels.ts";
import { PLAN_WITHIN_WORKING_DAYS, type Thresholds, type UnitStatus } from "./model.ts";
import { type ConditionScore, extentClass, type ExtentClass } from "./nen2767.ts";

/** Each status's translated `label` and badge tone. */
export const unitStatusDisplay = conditionLabels.withLabels("unitStatus", {
	critical: { tone: "danger" },
	attention: { tone: "warning" },
	planned: { tone: "info" },
	ok: { tone: "success" },
} satisfies Record<UnitStatus, BadgeDisplay>);

/** A score's name on the scale: 1 Uitstekend … 6 Zeer slecht. */
export function scoreLabel(score: number): string {
	switch (score) {
		case 1:
			return m.condition_score_1();
		case 2:
			return m.condition_score_2();
		case 3:
			return m.condition_score_3();
		case 4:
			return m.condition_score_4();
		case 5:
			return m.condition_score_5();
		default:
			return m.condition_score_6();
	}
}

/** What a score means, as NEN 2767 describes it: "Plaatselijk zichtbare veroudering". */
export function scoreDescription(score: number): string {
	switch (score) {
		case 1:
			return m.condition_score_1_description();
		case 2:
			return m.condition_score_2_description();
		case 3:
			return m.condition_score_3_description();
		case 4:
			return m.condition_score_4_description();
		case 5:
			return m.condition_score_5_description();
		default:
			return m.condition_score_6_description();
	}
}

/** A score with its name, as the badges and the log show it: "3 · Redelijk". */
export const scoreText = (score: number) => `${formatNumber(score)} · ${scoreLabel(score)}`;

/**
 * A score's colour, as the tile with its number (with the tone's foreground on it): 1–3 greens and
 * teal (success, mixed towards info), 4 amber, 5 orange (warning mixed towards destructive), 6 red.
 */
export const scoreColours: Record<ConditionScore, string> = {
	1: "bg-success text-success-foreground",
	2: "bg-[color-mix(in_oklch,var(--success)_80%,var(--info))] text-success-foreground",
	3: "bg-[color-mix(in_oklch,var(--success)_45%,var(--info))] text-success-foreground",
	4: "bg-warning text-warning-foreground",
	5: "bg-[color-mix(in_oklch,var(--warning)_55%,var(--destructive))] text-warning-foreground",
	6: "bg-destructive text-white",
};

/** An extent class as NEN names it: "<2%", "2–10%", … "≥70%". */
export function extentLabel(extent: ExtentClass): string {
	const labels: Record<ExtentClass, () => string> = {
		1: m.condition_extent_1,
		2: m.condition_extent_2,
		3: m.condition_extent_3,
		4: m.condition_extent_4,
		5: m.condition_extent_5,
	};
	return labels[extent]();
}

/** A defect's extent in percent, with its class: "20% (10–30%)". */
export const extentText = (percent: number) =>
	`${formatNumber(percent)}% (${extentLabel(extentClass(percent))})`;

/** What a status means and asks for, as the legend says it ("Wat betekenen de statussen?"). */
export function statusMeaning(status: UnitStatus, thresholds: Thresholds): string {
	const values = {
		critical: scoreText(thresholds.critical),
		attention: scoreText(thresholds.attention),
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
