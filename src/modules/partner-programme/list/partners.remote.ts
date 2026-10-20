/** The partners list's queries (see `partners-list.ts`). */
import { currentDay } from "#lib/dates.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { planList } from "#lib/server/lists/index.ts";

import { levelColour, levelFor, progressFor } from "../model.ts";
import { query } from "../remote-functions.ts";
import { partnersSql } from "../server/list-sql.ts";
import { rulesFor } from "../server/rules.ts";
import { partnerAccount } from "../server/schema.ts";
import { partnersList } from "./partners-list.ts";

/** The year the list is of, and its levels (for the level filter), lowest first. */
export const getPartnersYear = query(async () => {
	const year = currentDay().year;
	const rules = await rulesFor(year);
	return { year, levels: rules?.tiers.map((tier) => tier.level) ?? [] };
});

/**
 * A page of the tenant's partners with this year's Partner Omzet, level and progress, and the
 * credit in their wallet they can spend today (as their card has it), searched, sorted and
 * filtered as the query says, and how many match.
 */
export const getPartners = query(partnersList.query, async (input) => {
	const now = currentDay();
	const rules = await rulesFor(now.year);
	const listSql = partnersSql(rules, now);
	const { joins } = listSql;
	const tiers = rules?.tiers ?? [];
	return planList(listSql, input).answer(
		joins.join(
			db
				.select({
					id: partnerAccount.id,
					acceptedOn: partnerAccount.acceptedOn,
					customer: { code: customer.code, name: customer.name },
					revenue: joins.revenue,
					wallet: joins.wallet,
				})
				.from(partnerAccount)
				.$dynamic(),
		),
		{
			enrich: (rows) =>
				rows.map((row) => {
					const level = levelFor(tiers, row.revenue);
					return {
						...row,
						level: level?.level ?? null,
						colour: level ? levelColour(level) : undefined,
						progress: progressFor(tiers, row.revenue),
					};
				}),
		},
	);
});
