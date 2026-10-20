/**
 * The partners' revenue in a year: the lines of their invoices paid in it less those of their
 * credit notes settled in it (the invoicing module's `paidInvoiceLines()`, excluding VAT, §2.9's
 * "returns, credit notes … deducted"), each with its category and its order's classification
 * (`lineCategory()` in `../model.ts`); a credit note's line counts in the category of the line it
 * credits. The programme's own payouts (a cash bonus's credit note, `isBonusPayout()`) aren't in
 * it. Computed whenever it's asked, never stored while the year runs. In TypeScript for a
 * partner's figures, and in SQL (the Partner Omzet only) for the partners list, which sorts and
 * filters by it, and the dashboard.
 */
import { and, eq, isNull, ne, notLike, or, sql, type SQLWrapper } from "drizzle-orm";

import { idsInTenant, inTenant, tenantJoin, sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";
import { paidInvoiceLines } from "#modules/invoices/api/revenue.server.ts";

import {
	bonusSourcePrefix,
	defaultCategories,
	isBonusPayout,
	lineCategory,
	type ProgrammeRules,
	type RevenueLine,
	yearSpan,
} from "../model.ts";
import { orderClassification } from "./schema.ts";

/** The customers' revenue lines in `year`, by customer id (every one of them, also without any). */
export async function revenueLines(
	year: number,
	customerIds: readonly number[],
): Promise<Map<number, RevenueLine[]>> {
	const byCustomer = new Map<number, RevenueLine[]>(customerIds.map((id) => [id, []]));
	if (!customerIds.length) return byCustomer;
	const lines = (await paidInvoiceLines({ ...yearSpan(year), customerIds })).filter(
		(line) => !isBonusPayout(line),
	);
	const orderIds = [...new Set(lines.flatMap((line) => (line.orderId ? [line.orderId] : [])))];
	const orders = orderIds.length
		? await db
				.select({
					id: order.id,
					type: order.type,
					category: orderClassification.category,
					eligibility: orderClassification.eligibility,
					share: orderClassification.share,
				})
				.from(order)
				.leftJoin(
					orderClassification,
					and(eq(orderClassification.orderId, order.id), sameTenant(orderClassification, order)),
				)
				.where(idsInTenant(order, orderIds))
		: [];
	const ordersById = new Map(orders.map((row) => [row.id, row]));
	for (const line of lines) {
		const classified = line.orderId ? ordersById.get(line.orderId) : undefined;
		byCustomer.get(line.customerId)?.push({
			amount: line.amount,
			category: lineCategory({ source: line.source, order: classified ?? null }),
			eligibility: classified?.eligibility ?? null,
			share: classified?.share ?? null,
		});
	}
	return byCustomer;
}

/** `defaultCategories` in SQL: the category of an order of `type`. */
const defaultCategorySql = (type: SQLWrapper) =>
	sql`case ${type} ${sql.join(
		Object.entries(defaultCategories).map(
			([orderType, category]) => sql`when ${orderType} then ${category}`,
		),
		sql` `,
	)} end`;

/**
 * Each of the tenant's customers' Partner Omzet in `year` under `rules`, as a subquery
 * (`customerId`, `partnerRevenue`) to join: what `countsForLevel()` counts of their lines, in SQL
 * (`lineCategory()` and the default categories alike), credit notes taken off. Customers without
 * paid invoices or settled credit notes aren't in it.
 */
export function partnerRevenueSql(rules: ProgrammeRules) {
	const lines = paidInvoiceLines(yearSpan(rules.year)).as("paid_line");
	const category = sql`case
		when ${lines.orderId} is not null then coalesce(${orderClassification.category}, ${defaultCategorySql(order.type)})
		when ${lines.source} like 'contracts:%' then 'maintenance_contracts'
		else 'regular_orders' end`;
	const levelCategories = rules.categories
		.filter((rule) => rule.level)
		.map((rule) => rule.category);
	const counts = and(
		inList(category, levelCategories),
		or(isNull(orderClassification.eligibility), ne(orderClassification.eligibility, "excluded")),
		// Not the programme's own payouts (`isBonusPayout()`).
		or(isNull(lines.source), notLike(lines.source, `${bonusSourcePrefix}%`)),
	);
	return db
		.select({
			customerId: lines.customerId,
			partnerRevenue:
				sql<number>`max(0, coalesce(sum(case when ${counts} then ${lines.amount} else 0 end), 0))`.as(
					"partner_revenue",
				),
		})
		.from(lines)
		.leftJoin(...tenantJoin(order, lines.orderId))
		.leftJoin(
			orderClassification,
			and(eq(orderClassification.orderId, lines.orderId), inTenant(orderClassification)),
		)
		.groupBy(lines.customerId)
		.as("partner_revenue");
}
