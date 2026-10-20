import { collect, emit, save } from "#lib/server/extensions.ts";
import { Refused } from "#lib/server/refused.ts";

/**
 * Where core asks the modules about orders, besides their prices (`priceOrders()` in
 * `./pricing.ts`): each of the orders' extension points (`#lib/orders/extensions.ts`) has its one
 * caller here, for the modules that are on (by default the current tenant's).
 */
import {
	committed,
	type OrderChange,
	type OrderFacts,
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

/**
 * Refuses a change that isn't the order form's (a status, a deletion) with what a module said when
 * it refused its part, for the whole change: the fields it names aren't there. Rethrows anything
 * else.
 */
export function refusedWhole(thrown: unknown): never {
	if (thrown instanceof Refused) throw new Refused(thrown.message);
	throw thrown;
}

/**
 * Lets the modules save their part of an order that core is changing in `change.tx`, right after
 * core's own change to it (and before deleting it): e.g. the materials of the order form, and the
 * stock that follows the order's status. Every change to an order's status, its form and its
 * deletion goes through here. Throws a `Refused` with the problems of a module that can't, on the
 * order form's fields (a part's are under `modules.<its id>`), which rolls the transaction back; a
 * change without the form refuses them for the whole change (`refusedWhole()`).
 */
export async function saveOrderParts(change: OrderSaving, enabled?: readonly string[]) {
	const problems = await save(saving, change, enabled);
	Refused.check(problems);
}

/**
 * Lets the modules save their part of an order's units (`orders.units`), which `setOrderUnits()`
 * is setting in `change.tx`: after the units it gets are in, before the ones it loses go. Throws
 * a `Refused` with the problems of a module that can't let go of a unit; a problem without a
 * path is about the order form's units.
 */
export async function saveUnitParts(change: OrderUnitsSaving, enabled?: readonly string[]) {
	const problems = await save(units, change, enabled);
	Refused.check(
		problems.map((problem) => ({ ...problem, path: problem.path ?? ["equipmentIds"] })),
	);
}
