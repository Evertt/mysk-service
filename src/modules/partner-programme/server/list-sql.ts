/**
 * The partners list in SQL (see `../list/partners-list.ts`): each partner with its Partner Omzet
 * in the year (`partnerRevenueSql()`) and its wallet's balance, both as subqueries joined in, so
 * the list sorts and filters by them in the database.
 */
import { and, eq, gte, lt, or, sql } from "drizzle-orm";
import type { SQLiteSelect } from "drizzle-orm/sqlite-core";

import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { type ListSql, nocase } from "#lib/server/lists/index.ts";

import { partnersList } from "../list/partners-list.ts";
import { type ProgrammeRules, sortedTiers } from "../model.ts";
import { partnerRevenueSql } from "./revenue.ts";
import { partnerAccount, walletEntry } from "./schema.ts";

/**
 * Each of the tenant's wallets' balance (`customerId`, `balance`), as a subquery to join. The
 * balance, not what's `available` as the partner's card shows it (`walletSummary()`): the two
 * differ by credit past its date that the daily job hasn't expired yet (from the day after its date
 * until the job's next run, also for a spend given back to credit that expired since), and which
 * credit is past its date depends on which credit each spend took, which only replaying the ledger
 * in order tells (`replayWallet()` in `../model.ts`), not a sum the list can sort by.
 */
const walletBalanceSql = () =>
	db
		.select({
			customerId: walletEntry.customerId,
			balance: sql<number>`max(0, sum(${walletEntry.amount}))`.as("wallet_balance"),
		})
		.from(walletEntry)
		.where(inTenant(walletEntry))
		.groupBy(walletEntry.customerId)
		.as("wallet");

/**
 * The partners' joins: the customer, the Partner Omzet in the rules' year (none without rules:
 * then it's zero for all) and the wallet. Written once, for the rows, the counts and the facets.
 */
export function partnerJoins(rules: ProgrammeRules | undefined) {
	const revenue = rules ? partnerRevenueSql(rules) : undefined;
	const wallet = walletBalanceSql();
	const revenueOf = revenue ? sql<number>`coalesce(${revenue.partnerRevenue}, 0)` : sql<number>`0`;
	const balanceOf = sql<number>`coalesce(${wallet.balance}, 0)`;
	const join = <T extends SQLiteSelect>(query: T) => {
		const withCustomer = query.innerJoin(...tenantJoin(customer, partnerAccount.customerId));
		const withRevenue = revenue
			? withCustomer.leftJoin(revenue, eq(revenue.customerId, partnerAccount.customerId))
			: withCustomer;
		return withRevenue.leftJoin(wallet, eq(wallet.customerId, partnerAccount.customerId));
	};
	return { join, revenue: revenueOf, wallet: balanceOf };
}

/** The Partner Omzet of the levels named (`null` below the first), as a condition. */
function inLevels(
	revenue: ReturnType<typeof partnerJoins>["revenue"],
	rules: ProgrammeRules | undefined,
	levels: (string | null)[],
) {
	const tiers = sortedTiers(rules?.tiers ?? []);
	const ranges = levels.flatMap((level) => {
		if (level === null) return [tiers.length ? lt(revenue, tiers[0].threshold) : sql`1`];
		const at = tiers.findIndex((tier) => tier.level === level);
		if (at < 0) return [];
		const next = tiers[at + 1];
		return [
			next
				? and(gte(revenue, tiers[at].threshold), lt(revenue, next.threshold))!
				: gte(revenue, tiers[at].threshold),
		];
	});
	return ranges.length ? or(...ranges) : sql`0`;
}

/**
 * The partners list's columns in SQL, for the rules' year, with the joins its rows are selected
 * through. Call it for each request.
 */
export function partnersSql(
	rules: ProgrammeRules | undefined,
): ListSql<typeof partnersList.columns> & { joins: ReturnType<typeof partnerJoins> } {
	const joins = partnerJoins(rules);
	return {
		joins,
		list: partnersList,
		from: (fields) => joins.join(db.select(fields).from(partnerAccount).$dynamic()),
		columns: {
			partner: { sort: nocase(customer.name) },
			level: { filter: (levels) => inLevels(joins.revenue, rules, levels) },
			revenue: { sort: joins.revenue },
			wallet: { sort: joins.wallet },
			accepted: { sort: partnerAccount.acceptedOn },
		},
		search: [customer.name, customer.code],
		id: partnerAccount.id,
		scope: () => inTenant(partnerAccount),
	};
}
