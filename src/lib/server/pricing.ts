import type { PriceAdjustment } from "#lib/modules.js";

import { enabledServerModules, type OrderFacts, type ServerModule } from "./modules.ts";

/** Used to estimate labour cost while no engineer is assigned yet. In cents. */
export const STANDARD_HOURLY_RATE = 8500;

/** Labour cost in cents, at the engineer's rate or the standard rate when unassigned. */
export const laborCost = (hours: number, hourlyRate: number | null | undefined) =>
	Math.round(hours * (hourlyRate ?? STANDARD_HOURLY_RATE));

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
		modules.flatMap((module) => (module.adjustPrices ? [module.adjustPrices(priced)] : [])),
	);
	return priced.map(({ id, materials, labor }) => {
		const adjustments = answers.flatMap((adjusted) => adjusted.get(id) ?? []);
		return { materials, labor, adjustments, total: orderTotal(materials, labor, adjustments) };
	});
}
