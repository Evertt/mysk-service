/**
 * The server side of the optional modules (see `#lib/modules.ts`): hooks through which a module
 * takes part in core server logic without core importing the module. Core calls them through
 * `priceOrders()` (`#lib/server/pricing.ts`) and `tagOrders()` below, for the modules the current
 * tenant has.
 *
 * A hook gets a batch of orders (a whole list at once, to keep it to a query or two) and answers
 * for the orders it has something to say about, by id.
 */
import type { OrderStatus, OrderType } from "#lib/models.js";
import type { ModuleId, OrderTag, PriceAdjustment } from "#lib/modules.js";

import { contracts } from "./contracts.ts";
import { requireMember } from "./session.ts";

/** What a module gets to know about an order. All of the current tenant's. */
export interface OrderFacts {
	id: number;
	type: OrderType;
	status: OrderStatus;
	equipmentId: number | null;
	createdAt: Date;
}

/** An order with its price before adjustments, in cents. */
export interface PricedOrderFacts extends OrderFacts {
	materials: number;
	labor: number;
}

export interface ServerModule {
	/** Changes to orders' prices, e.g. the work a contract includes, as a discount. */
	adjustPrices?(orders: PricedOrderFacts[]): Promise<Map<number, PriceAdjustment[]>>;
	/** Badges for orders, e.g. a response time about to be missed (at `now`). */
	tagOrders?(orders: OrderFacts[], now: Date): Promise<Map<number, OrderTag[]>>;
	/**
	 * Called when core has saved an order: refreshes the module's own queries about it (e.g. what
	 * its card on the order's page shows), so they come back with the save, like core's.
	 */
	orderSaved?(number: string): void;
}

/** Each module's server hooks; a module without any isn't listed. */
const serverModules: { [Id in ModuleId]?: ServerModule } = { contracts };

/** The server hooks of the `enabled` modules (by default the current tenant's). */
export function enabledServerModules(
	enabled: readonly string[] = requireMember().modules,
): ServerModule[] {
	return Object.entries(serverModules).flatMap(([id, module]) =>
		module && enabled.includes(id) ? [module] : [],
	);
}

/** The modules' badges for each order, in the same order as `orders`. */
export async function tagOrders(
	orders: OrderFacts[],
	now = new Date(),
	modules = enabledServerModules(),
): Promise<OrderTag[][]> {
	if (!orders.length) return [];
	const answers = await Promise.all(
		modules.flatMap((module) => (module.tagOrders ? [module.tagOrders(orders, now)] : [])),
	);
	return orders.map((order) => answers.flatMap((tags) => tags.get(order.id) ?? []));
}

/** Lets the modules refresh what they show about an order that core has just saved. */
export function orderSaved(number: string, modules = enabledServerModules()) {
	for (const module of modules) module.orderSaved?.(number);
}
