import { sql, type SQLWrapper } from "drizzle-orm";

import type { PriceAdjustment } from "#lib/modules/manifests.ts";
import { inTenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { orderLine } from "#lib/server/db/schema.ts";
import {
	enabledServerModules,
	type OrderFacts,
	type ServerModule,
} from "#lib/server/modules/hooks.ts";

/** Used to estimate labour cost while no engineer is assigned yet. In cents. */
export const STANDARD_HOURLY_RATE = 8500;

/** Labour cost in cents, at the engineer's rate or the standard rate when unassigned. */
export const laborCost = (hours: number, hourlyRate: number | null | undefined) =>
	Math.round(hours * (hourlyRate ?? STANDARD_HOURLY_RATE));

/**
 * An order line's total in cents, in SQL: the twin of `lineTotal()` in `#lib/models.ts`, which
 * rounds the same way. To add the lines up, wrap it in `sum()` in a `sql` template.
 */
export const lineTotalSql = (line: { quantity: SQLWrapper; unitPrice: SQLWrapper } = orderLine) =>
	sql<number>`round(${line.quantity} * ${line.unitPrice})`;

/**
 * The tenant's order lines added up per order, as a subquery to join to `order` and feed
 * `priceOrders()`: `.leftJoin(materials, eq(materials.orderId, order.id))`. Select `materials.total`
 * with a `coalesce(…, 0)`, for an order without lines.
 */
export const materialsPerOrder = () =>
	db
		.select({
			orderId: orderLine.orderId,
			total: sql<number>`sum(${lineTotalSql()})`.as("total"),
		})
		.from(orderLine)
		.where(inTenant(orderLine))
		.groupBy(orderLine.orderId)
		.as("materials");

/** An order to price: what modules know about it, its materials (in cents) and its labour. */
export interface OrderToPrice extends OrderFacts {
	/** The order lines' total, in cents. */
	materials: number;
	laborHours: number;
	/** The assigned engineer's, if any. In cents. */
	hourlyRate: number | null | undefined;
}

/** An order's price, in cents. */
export interface OrderPrice {
	materials: number;
	labor: number;
	/** From the tenant's modules, e.g. work a service contract includes. */
	adjustments: PriceAdjustment[];
	total: number;
}

/** Materials plus labour plus adjustments, but never below zero. */
export const orderTotal = (materials: number, labor: number, adjustments: PriceAdjustment[]) =>
	Math.max(
		0,
		adjustments.reduce((sum, adjustment) => sum + adjustment.amount, materials + labor),
	);

/**
 * What orders cost: materials, labour, and the adjustments of the tenant's modules. Everything that
 * shows or adds up order totals (the order's page, the orders table, the dashboard's revenue, an
 * invoice) prices them here, so they agree. Returns the prices in the same order as `orders`.
 *
 * The one place the modules' `orders.adjustPrices` is called. It's a collector (see
 * `#lib/server/modules/hooks.ts`): asked in parallel about all the orders at once, the adjustments
 * merged in registry order; a module that throws fails the pricing.
 */
export async function priceOrders(
	orders: OrderToPrice[],
	modules: ServerModule[] = enabledServerModules(),
): Promise<OrderPrice[]> {
	const priced = orders.map(({ laborHours, hourlyRate, ...order }) => ({
		...order,
		labor: laborCost(laborHours, hourlyRate),
	}));
	if (!priced.length) return [];
	const answers = await Promise.all(
		modules.flatMap((module) =>
			module.orders?.adjustPrices ? [module.orders.adjustPrices(priced)] : [],
		),
	);
	return priced.map(({ id, materials, labor }) => {
		const adjustments = answers.flatMap((adjusted) => adjusted.get(id) ?? []);
		return { materials, labor, adjustments, total: orderTotal(materials, labor, adjustments) };
	});
}
