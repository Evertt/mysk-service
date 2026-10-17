/**
 * The programme's rules per year (`partner_programme_year`): the levels, how each revenue category
 * counts and how long credit stays valid. A year that isn't set up yet goes by the latest one
 * before it; a manager adds it (a copy of that one) to change its rules.
 */
import { and, desc, eq, lte } from "drizzle-orm";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

import {
	completeCategories,
	defaultCategoryRules,
	defaultTiers,
	type ProgrammeRules,
	sortedTiers,
} from "../model.ts";
import { programmeYear } from "./schema.ts";

/** A year's rules as stored, with the row's id. */
export interface StoredRules extends ProgrammeRules {
	id: number;
}

type Row = typeof programmeYear.$inferSelect;

const rulesOf = (row: Row): StoredRules => ({
	id: row.id,
	year: row.year,
	tiers: sortedTiers(row.tiers),
	categories: completeCategories(row.categories),
	creditValidYears: row.creditValidYears,
});

/** The years the tenant has set up, latest first. */
export async function programmeYears(tx: Transaction | typeof db = db) {
	const rows = await tx
		.select()
		.from(programmeYear)
		.where(inTenant(programmeYear))
		.orderBy(desc(programmeYear.year));
	return rows.map(rulesOf);
}

/** The rules of `year` as set up, none if it isn't. */
export async function storedRules(year: number, tx: Transaction | typeof db = db) {
	const [row] = await tx
		.select()
		.from(programmeYear)
		.where(and(inTenant(programmeYear), eq(programmeYear.year, year)));
	return row ? rulesOf(row) : undefined;
}

/**
 * The rules that apply to `year`: its own, else the latest year's before it (as `year`), none if
 * the programme has no year up to it.
 */
export async function rulesFor(
	year: number,
	tx: Transaction | typeof db = db,
): Promise<StoredRules | undefined> {
	const [row] = await tx
		.select()
		.from(programmeYear)
		.where(and(inTenant(programmeYear), lte(programmeYear.year, year)))
		.orderBy(desc(programmeYear.year))
		.limit(1);
	if (!row) return undefined;
	return { ...rulesOf(row), year };
}

/** The year's subject in the activity log. */
const subjectOf = (rules: { id: number; year: number }) => ({
	type: "partner_programme_year",
	id: rules.id,
	label: String(rules.year),
});

/**
 * Sets up `year` as a copy of the latest year before it (SHLTR's levels and categories for a first
 * one), in `tx`, and logs it. Answers its rules; the ones it has if it's set up already.
 */
export async function addYear(tx: Transaction, year: number): Promise<StoredRules> {
	const existing = await storedRules(year, tx);
	if (existing) return existing;
	const before = await rulesFor(year - 1, tx);
	const [row] = await tx
		.insert(programmeYear)
		.values({
			organizationId: currentTenant().organizationId,
			year,
			tiers: before?.tiers ?? defaultTiers,
			categories: before?.categories ?? defaultCategoryRules,
			creditValidYears: before?.creditValidYears ?? 1,
		})
		.returning();
	const added = rulesOf(row);
	await recordActivity(tx, {
		action: "created",
		subject: subjectOf(added),
		note: before ? m.partners_year_copied({ year: String(before.year) }) : null,
	});
	return added;
}

/** Changes a year's rules (setting it up first if it isn't), in `tx`, and logs what changed. */
export async function saveRules(
	tx: Transaction,
	year: number,
	rules: Omit<ProgrammeRules, "year">,
): Promise<void> {
	const before = await addYear(tx, year);
	const after = {
		tiers: sortedTiers(rules.tiers),
		categories: completeCategories(rules.categories),
		creditValidYears: rules.creditValidYears,
	};
	await tx.update(programmeYear).set(after).where(idInTenant(programmeYear, before.id));
	await recordActivity(tx, { action: "updated", subject: subjectOf(before), before, after });
}
