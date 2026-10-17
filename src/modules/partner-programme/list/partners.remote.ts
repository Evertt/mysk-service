/** The partners list's queries (see `partners-list.ts`). */
import { queryKey } from "#lib/components/data-table/list-definition.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { planList } from "#lib/server/lists/index.ts";

import { levelFor, progressFor } from "../model.ts";
import { query } from "../remote-functions.ts";
import { partnersSql } from "../server/list-sql.ts";
import { today } from "../server/partners.ts";
import { rulesFor } from "../server/rules.ts";
import { partnerAccount } from "../server/schema.ts";
import { partnersList } from "./partners-list.ts";

/** The year the list is of, and its levels (for the level filter), lowest first. */
export const getPartnersYear = query(async () => {
	const year = today().year;
	const rules = await rulesFor(year);
	return { year, levels: rules?.tiers.map((tier) => tier.level) ?? [] };
});

/**
 * A page of the tenant's partners with this year's Partner Omzet, level and progress, and their
 * wallet's balance, searched, sorted and filtered as the query says, and how many match.
 */
export const getPartners = query(partnersList.query, async (input) => {
	const rules = await rulesFor(today().year);
	const listSql = partnersSql(rules);
	const plan = planList(listSql, input);
	const { joins } = listSql;
	const [rows, rowCount] = await Promise.all([
		plan.paged(
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
		),
		plan.count(),
	]);
	const tiers = rules?.tiers ?? [];
	return {
		rows: rows.map((row) => ({
			...row,
			level: levelFor(tiers, row.revenue)?.level ?? null,
			progress: progressFor(tiers, row.revenue),
		})),
		rowCount,
		query: input,
		key: queryKey(input),
	};
});
