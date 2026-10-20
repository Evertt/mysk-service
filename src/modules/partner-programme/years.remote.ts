import { redirect } from "@sveltejs/kit";
import * as v from "valibot";

/**
 * The programme's years and their rules: every member may read them, managers set up a year (a
 * copy of the one before) and change its rules. Closing a year is in `close.remote.ts`.
 */
import { currentDay } from "#lib/dates.ts";
import { db } from "#lib/server/db/index.ts";

import { rulesSchema } from "./form/rules-schema.ts";
import { yearField } from "./form/wallet-schema.ts";
import { defaultCategoryRules, defaultTiers } from "./model.ts";
import { forManagers, query } from "./remote-functions.ts";
import { addYear, programmeYears, rulesFor, saveRules, storedRules } from "./server/rules.ts";

/** A year as the client asks for it. */
const year = v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2100));

/** The years set up, latest first, and the one to add next. */
export const getProgrammeYears = query(async () => {
	const years = await programmeYears();
	const current = currentDay().year;
	const next = Math.max(current, (years[0]?.year ?? current - 1) + 1);
	return {
		years: years.map((each) => ({ year: each.year, levels: each.tiers.length })),
		current,
		next,
	};
});

/**
 * A year's rules: its own if it's set up (`setUp`), else the ones it goes by (the latest year's
 * before it, `from`), else the ones a first year starts with.
 */
export const getYearRules = query(year, async (wanted) => {
	const own = await storedRules(wanted);
	const before = own ? undefined : await rulesFor(wanted);
	const fallback = {
		year: wanted,
		tiers: defaultTiers,
		categories: defaultCategoryRules,
		creditValidYears: 1,
	};
	return {
		year: wanted,
		rules: own ?? before ?? fallback,
		setUp: !!own,
		from: before
			? ((await programmeYears()).find((each) => each.year <= wanted)?.year ?? null)
			: null,
	};
});

/** Sets up a year as a copy of the one before, and opens its rules. */
export const addProgrammeYear = forManagers.form(v.object({ year: yearField }), async (input) => {
	await db.transaction((tx) => addYear(tx, input.year));
	void getProgrammeYears().refresh();
	redirect(303, `/partner-programme/settings/${input.year}`);
});

/** Changes a year's rules (setting it up first if it isn't). */
export const saveYearRules = forManagers.form(rulesSchema, async (input) => {
	await db.transaction((tx) => saveRules(tx, input.year, input));
	void getYearRules(input.year).refresh();
	void getProgrammeYears().refresh();
});
