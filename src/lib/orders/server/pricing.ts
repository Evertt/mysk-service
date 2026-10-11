import { collect } from "#lib/server/extensions.ts";

import {
	adjustPrices,
	costs,
	type OrderCost,
	type OrderFacts,
	type PriceAdjustment,
} from "../extensions.ts";

/** Used to estimate labour cost while no engineer is assigned yet. In cents. */
export const STANDARD_HOURLY_RATE = 8500;

/** Labour cost in cents, at the engineer's rate or the standard rate when unassigned. */
export const laborCost = (hours: number, hourlyRate: number | null | undefined) =>
	Math.round(hours * (hourlyRate ?? STANDARD_HOURLY_RATE));

/** What the costs add up to, in cents. */
export const costsTotal = (orderCosts: readonly OrderCost[]) =>
	orderCosts.reduce((sum, cost) => sum + cost.amount, 0);

/** An order to price: what modules know about it, and its labour. */
export interface OrderToPrice extends OrderFacts {
	laborHours: number;
	/** The assigned engineer's, if any. In cents. */
	hourlyRate: number | null | undefined;
}

/** An order's price, in cents. */
export interface OrderPrice {
	labor: number;
	/** From the tenant's modules, e.g. the materials used on it. */
	costs: OrderCost[];
	/** From the tenant's modules, e.g. work a service contract includes. */
	adjustments: PriceAdjustment[];
	total: number;
}

/** Costs plus labour plus adjustments, but never below zero. */
export const orderTotal = (orderCosts: number, labor: number, adjustments: PriceAdjustment[]) =>
	Math.max(
		0,
		adjustments.reduce((sum, adjustment) => sum + adjustment.amount, orderCosts + labor),
	);

/**
 * What orders cost: labour, the costs the tenant's modules add (e.g. materials) and their
 * adjustments. Everything that shows or adds up order totals (the order's page, the orders table,
 * the dashboard's revenue, an invoice) prices them here, so they agree. Returns the prices in the
 * same order as `orders`; with `items`, the costs list what they're made of (for a page that shows
 * them).
 *
 * The one place the modules' `orders.costs` and `orders.adjustPrices` are called (for the
 * `enabled` modules, by default the current tenant's). Both are collectors (see
 * `#lib/server/extensions.ts`): asked in parallel about all the orders at once, merged in registry
 * order; a module that throws fails the pricing. The costs come first: the adjustments get them.
 */
export async function priceOrders(
	orders: OrderToPrice[],
	{ items = false, enabled }: { items?: boolean; enabled?: readonly string[] } = {},
): Promise<OrderPrice[]> {
	if (!orders.length) return [];
	const facts = orders.map(({ laborHours: _hours, hourlyRate: _rate, ...order }) => order);
	const costAnswers = await collect(costs, { orders: facts, items }, enabled);
	const priced = orders.map(({ laborHours, hourlyRate, ...order }) => ({
		...order,
		labor: laborCost(laborHours, hourlyRate),
		costs: costAnswers.flatMap((answer) => answer.get(order.id) ?? []),
	}));
	const answers = await collect(adjustPrices, priced, enabled);
	return priced.map(({ id, costs: orderCosts, labor }) => {
		const adjustments = answers.flatMap((adjusted) => adjusted.get(id) ?? []);
		const total = orderTotal(costsTotal(orderCosts), labor, adjustments);
		return { labor, costs: orderCosts, adjustments, total };
	});
}
