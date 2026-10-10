/**
 * Where core asks the modules about orders, besides their prices (`priceOrders()` in
 * `./pricing.ts`): each of the orders' extension points (`#lib/orders/extensions.ts`) has its one
 * caller here, for the modules that are on (by default the current tenant's).
 */
import {
	committed,
	type OrderChange,
	type OrderFacts,
	type OrderTag,
	tag,
} from "#lib/orders/extensions.ts";
import { collect, emit } from "#lib/server/extensions.ts";

/** The modules' badges for each order, in the same order as `orders`. */
export async function tagOrders(
	orders: OrderFacts[],
	now = new Date(),
	enabled?: readonly string[],
): Promise<OrderTag[][]> {
	if (!orders.length) return [];
	const answers = await collect(tag, { orders, now }, enabled);
	return orders.map((order) => answers.flatMap((tags) => tags.get(order.id) ?? []));
}

/**
 * Lets the modules refresh what they show about an order that core has saved, once the
 * transaction it was saved in (if any) has committed.
 */
export function orderCommitted(change: OrderChange, enabled?: readonly string[]) {
	emit(committed, change, enabled);
}
