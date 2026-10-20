/**
 * A year's rules as a manager edits them: the levels (a threshold in whole euros, a name, the cash
 * and credit percentages), how each revenue category counts, and how long the credit stays valid.
 * Stored in cents and basis points.
 */
import * as v from "valibot";

import { numberIn, text, wholeIn } from "#lib/schema.ts";

import { categoryRuleValues, levelColours, revenueCategories, ruleLimits } from "../model.ts";
import { yearField } from "./wallet-schema.ts";

/** A percentage with at most two decimals, as basis points (3.8 → 380). */
const rate = () =>
	v.pipe(
		numberIn({
			max: 100,
			message: m.partners_rate_required,
			tooLow: m.validation_not_negative,
			tooHigh: m.partners_rate_max,
		}),
		v.transform((percent) => Math.round(percent * 100)),
	);

const tier = v.object({
	level: v.pipe(text(m.partners_level_required), v.maxLength(40)),
	threshold: v.pipe(
		wholeIn({
			message: m.partners_threshold_required,
			fraction: m.partners_threshold_whole,
			tooLow: m.validation_not_negative,
		}),
		v.transform((euros) => euros * 100),
	),
	cashRate: rate(),
	creditRate: rate(),
	// Empty: by its name (`levelColour()`).
	colour: v.pipe(
		v.optional(v.picklist(["", ...levelColours]), ""),
		v.transform((colour) => colour || undefined),
	),
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
	creditValidYears: wholeIn({
		...ruleLimits.creditValidYears,
		message: m.partners_valid_years_required,
	}),
});
