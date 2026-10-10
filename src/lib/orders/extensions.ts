/**
 * The orders' extension points: where modules take part in pricing, badging and saving orders
 * (see `#lib/server/extensions.ts`). Each has one caller in `#lib/orders/server/`: `priceOrders()`
 * (`pricing.ts`), `tagOrders()` and `orderCommitted()` (`hooks.ts`). Isomorphic, so the types are
 * also there for the pages that show tags and adjustments.
 */
import { defineCollector, defineEvent } from "#lib/extensions/define.ts";
import type { OrderStatus, OrderType } from "#lib/models.ts";

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

/** What happened to an order that core has saved. */
export interface OrderChange {
	number: string;
}

/**
 * A badge a module puts next to an order's status, on the order's page and in the orders table,
 * e.g. a response time about to be missed.
 */
export interface OrderTag {
	label: string;
	/** `warning` needs attention soon, `danger` now. */
	tone: "warning" | "danger";
	/** Shown on hover, e.g. the deadline. */
	detail?: string;
}

/**
 * A change a module makes to an order's price, shown as a line of its own on the order: e.g. work
 * a service contract includes. In cents; negative for a discount.
 */
export interface PriceAdjustment {
	label: string;
	/** A second line under the label, e.g. what's included. */
	detail?: string;
	amount: number;
}

/**
 * Changes to orders' prices, by order id, e.g. the work a contract includes, as a discount. A
 * module that fails fails the pricing: a broken price must not quietly become a wrong total.
 */
export const adjustPrices = defineCollector<PricedOrderFacts[], Map<number, PriceAdjustment[]>>(
	"orders.adjustPrices",
	{ onError: "fail" },
);

/**
 * Badges for orders (at `now`), by order id, e.g. a response time about to be missed. A module
 * that fails is left out: the orders still show, without its badges.
 */
export const tag = defineCollector<{ orders: OrderFacts[]; now: Date }, Map<number, OrderTag[]>>(
	"orders.tag",
	{ onError: "skip" },
);

/**
 * Core has saved an order. A module refreshes its own queries about it (e.g. what its card on the
 * order's page shows), so they come back with the save, like core's.
 */
export const committed = defineEvent<OrderChange>("orders.committed");
