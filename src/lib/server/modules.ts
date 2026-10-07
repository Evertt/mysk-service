/**
 * The server side of the optional modules (see `#lib/modules.ts`): hooks through which a module
 * takes part in core server logic without core importing the module. Core calls them through
 * `priceOrders()` (`#lib/server/pricing.ts`) and `tagOrders()` below, for the modules the current
 * tenant has. Modules can use them among themselves too: invoicing bills what the others offer
 * through `billableItems()`, without knowing which module offers what.
 *
 * A hook gets a batch of orders (a whole list at once, to keep it to a query or two) and answers
 * for the orders it has something to say about, by id.
 */
import type { OrderStatus, OrderType } from "#lib/models.js";
import type { ModuleId, OrderTag, PriceAdjustment } from "#lib/modules.js";

import { contracts } from "./contracts.ts";
import { invoicing } from "./invoicing.ts";
import { requireTenant } from "./session.ts";

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
	/**
	 * What a customer owes for besides orders, e.g. a contract's monthly fees: the items that
	 * became due in `period` (both days inclusive). Whoever bills them (the invoicing module)
	 * remembers which references it billed and leaves those out.
	 */
	billableItems?(customerId: number, period: BillingPeriod): Promise<BillableItem[]>;
}

/** From and until which days (at midnight, both inclusive) to look for billable items. */
export interface BillingPeriod {
	from: Date;
	until: Date;
}

/** Something a module bills a customer for, other than an order. Amounts in cents. */
export interface BillableItem {
	/**
	 * Identifies the item across modules and over time, starting with the module's id, e.g.
	 * `contracts:12:2026-10-01` for a contract's October fee.
	 */
	reference: string;
	description: string;
	detail?: string;
	quantity: number;
	unitPrice: number;
	/** When it became due. */
	date: Date;
}

/** Each module's server hooks; a module without any isn't listed. */
const serverModules: { [Id in ModuleId]?: ServerModule } = { contracts, invoicing };

/** The server hooks of the `enabled` modules (by default the current tenant's). */
export function enabledServerModules(
	enabled: readonly string[] = requireTenant().modules,
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

/** The modules' billable items for a customer in `period`, by date. */
export async function billableItems(
	customerId: number,
	period: BillingPeriod,
	modules = enabledServerModules(),
): Promise<BillableItem[]> {
	const answers = await Promise.all(
		modules.flatMap((module) =>
			module.billableItems ? [module.billableItems(customerId, period)] : [],
		),
	);
	return answers.flat().sort((a, b) => a.date.getTime() - b.date.getTime());
}
