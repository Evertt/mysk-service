/**
 * The partners list in SQL (see `../list/partners-list.ts`): each partner with its Partner Omzet
 * in the year (`partnerRevenueSql()`) and the credit in its wallet it can spend today, both as
 * subqueries joined in, so the list sorts and filters by them in the database.
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
import { creditAvailableOn } from "./wallet.ts";

/**
 * Each of the tenant's wallets' credit that can be spent on `today` (`customerId`, `available`),
 * as a subquery to join: what's left of each credit still valid (`remaining`, which every entry
 * keeps by replaying the ledger), so the same as `available` on the partner's card
 * (`walletSummary()`), also for credit past its date before the daily job expires it.
 */
const walletAvailableSql = (today: Temporal.PlainDate) =>
	db
		.select({
			customerId: walletEntry.customerId,
			available: sql<number>`sum(${walletEntry.remaining})`.as("wallet_available"),
		})
		.from(walletEntry)
		.where(and(inTenant(walletEntry), creditAvailableOn(today)))
		.groupBy(walletEntry.customerId)
		.as("wallet");

/**
 * The partners' joins: the customer, the Partner Omzet in the rules' year (none without rules:
 * then it's zero for all) and the wallet's credit available on `today`. Written once, for the
 * rows, the counts and the facets.
 */
export function partnerJoins(rules: ProgrammeRules | undefined, today: Temporal.PlainDate) {
	const revenue = rules ? partnerRevenueSql(rules) : undefined;
	const wallet = walletAvailableSql(today);
	const revenueOf = revenue ? sql<number>`coalesce(${revenue.partnerRevenue}, 0)` : sql<number>`0`;
	const availableOf = sql<number>`coalesce(${wallet.available}, 0)`;
	const join = <T extends SQLiteSelect>(query: T) => {
		const withCustomer = query.innerJoin(...tenantJoin(customer, partnerAccount.customerId));
		const withRevenue = revenue
			? withCustomer.leftJoin(revenue, eq(revenue.customerId, partnerAccount.customerId))
			: withCustomer;
		return withRevenue.leftJoin(wallet, eq(wallet.customerId, partnerAccount.customerId));
	};
	return { join, revenue: revenueOf, wallet: availableOf };
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
 * The partners list's columns in SQL, for the rules' year and the wallets on `today`, with the
 * joins its rows are selected through. Call it for each request.
 */
export function partnersSql(
	rules: ProgrammeRules | undefined,
	today: Temporal.PlainDate,
): ListSql<typeof partnersList.columns> & { joins: ReturnType<typeof partnerJoins> } {
	const joins = partnerJoins(rules, today);
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
