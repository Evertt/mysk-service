/**
 * A year's rules as a manager edits them: the levels (a threshold in whole euros, a name, the cash
 * and credit percentages), how each revenue category counts, and how long the credit stays valid.
 * Stored in cents and basis points.
 */
import * as v from "valibot";

import { text } from "#lib/schema.ts";

import { categoryRuleValues, revenueCategories, ruleLimits } from "../model.ts";
import { yearField } from "./wallet-schema.ts";

/** A percentage with at most two decimals, as basis points (3.8 → 380). */
const rate = () =>
	v.pipe(
		v.number(m.partners_rate_required),
		v.minValue(0, m.validation_not_negative),
		v.maxValue(100, m.partners_rate_max),
		v.transform((percent) => Math.round(percent * 100)),
	);

const tier = v.object({
	level: v.pipe(text(m.partners_level_required), v.maxLength(40)),
	threshold: v.pipe(
		v.number(m.partners_threshold_required),
		v.integer(m.partners_threshold_whole),
		v.minValue(0, m.validation_not_negative),
		v.transform((euros) => euros * 100),
	),
	cashRate: rate(),
	creditRate: rate(),
});

const categoryRule = v.object({
	category: v.picklist(revenueCategories),
	level: v.optional(v.boolean(), false),
	cash: v.picklist(categoryRuleValues, m.validation_choose_one),
	credit: v.picklist(categoryRuleValues, m.validation_choose_one),
});

const unique = <T>(values: T[]) => new Set(values).size === values.length;

export const rulesSchema = v.object({
	year: yearField,
	tiers: v.pipe(
		v.array(tier),
		v.minLength(ruleLimits.tiers.min, m.partners_tiers_required),
		v.maxLength(ruleLimits.tiers.max),
		v.check(
			(tiers) => unique(tiers.map((each) => each.level.toLowerCase())),
			m.partners_tiers_unique_level,
		),
		v.check(
			(tiers) => unique(tiers.map((each) => each.threshold)),
			m.partners_tiers_unique_threshold,
		),
	),
	categories: v.pipe(
		v.array(categoryRule),
		v.check((rules) => unique(rules.map((rule) => rule.category)), m.partners_categories_unique),
	),
	creditValidYears: v.pipe(
		v.number(m.partners_valid_years_required),
		v.integer(m.partners_valid_years_required),
		v.minValue(ruleLimits.creditValidYears.min, m.partners_valid_years_required),
		v.maxValue(ruleLimits.creditValidYears.max, m.partners_valid_years_required),
	),
});
