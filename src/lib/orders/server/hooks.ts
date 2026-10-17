import { collect, emit, save } from "#lib/server/extensions.ts";

/**
 * Where core asks the modules about orders, besides their prices (`priceOrders()` in
 * `./pricing.ts`): each of the orders' extension points (`#lib/orders/extensions.ts`) has its one
 * caller here, for the modules that are on (by default the current tenant's).
 */
import {
	committed,
	type OrderChange,
	type OrderFacts,
	type OrderProblem,
	type OrderSaving,
	type OrderTag,
	type OrderUnitsSaving,
	saving,
	tag,
	units,
} from "../extensions.ts";

/** The modules' badges for each order, in the same order as `orders`. */
export async function tagOrders(
	orders: OrderFacts[],
	now = Temporal.Now.instant(),
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

/** A module refused its part of an order's change: thrown, so the transaction stores none of it. */
export class OrderRefused extends Error {
	constructor(readonly problems: OrderProblem[]) {
		super(problems.map((problem) => problem.message).join(" "));
	}
}

/**
 * Lets the modules save their part of an order that core is changing in `change.tx`, right after
 * core's own change to it (and before deleting it): e.g. the materials of the order form, and the
 * stock that follows the order's status. Every change to an order's status, its form and its
 * deletion goes through here. Throws an `OrderRefused` with the problems of a module that can't,
 * which rolls the transaction back; the caller shows them (on the form's fields, or as a message).
 */
export async function saveOrderParts(change: OrderSaving, enabled?: readonly string[]) {
	const problems = await save(saving, change, enabled);
	if (problems.length) throw new OrderRefused(problems);
}

/**
 * Lets the modules save their part of an order's units (`orders.units`), which `setOrderUnits()`
 * is setting in `change.tx`: after the units it gets are in, before the ones it loses go. Throws
 * an `OrderRefused` with the problems of a module that can't let go of a unit; a problem without a
 * path is about the order form's units.
 */
export async function saveUnitParts(change: OrderUnitsSaving, enabled?: readonly string[]) {
	const problems = await save(units, change, enabled);
	if (problems.length) {
		throw new OrderRefused(
			problems.map((problem) => ({ ...problem, path: problem.path ?? ["equipmentIds"] })),
		);
	}
}
