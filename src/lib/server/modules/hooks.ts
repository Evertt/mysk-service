/**
 * The server side of the optional modules (see `#lib/modules/manifests.ts`): hooks through which a module
 * takes part in core server logic without core importing the module. A module implements them with
 * `defineServerModule()`, grouped by the core domain they belong to (`orders`, `billing`). Core
 * calls each from one function of its own, for the modules the current tenant has: `priceOrders()`
 * (`#lib/orders/server/pricing.ts`), `tagOrders()`, `orderCommitted()` and `billableItems()` below.
 * Modules can use them among themselves too: invoicing bills what the others offer through
 * `billableItems()`, without knowing which module offers what.
 *
 * A hook is one of these kinds, and keeps to its rules:
 *
 * - Collector (`adjustPrices`, `tag`, `billableItems`): asked in parallel, about a batch (a whole
 *   list of orders at once, to keep it to a query or two), and answers for the ones it has
 *   something to say about, by id. The answers are merged in registry order. A hook that throws
 *   fails the request: a broken price must not quietly become a wrong total.
 * - Event after commit (`committed`): called in registry order once the change is committed, in
 *   the same request (see `afterCommit()` in `#lib/server/db/serialize.ts`). Errors are caught and
 *   logged, never thrown: the change is made.
 *
 * Registry order is the order of `serverModules()` below. Add a hook (a guard that refuses a
 * change, an event inside the transaction) when a module needs one, not before.
 */
import { error } from "@sveltejs/kit";

import type { OrderStatus, OrderType } from "#lib/models.ts";
import type { ModuleId, OrderTag, PriceAdjustment } from "#lib/modules/manifests.ts";
import { m } from "#lib/paraglide/messages.js";
import { requireModule, requireTenant } from "#lib/server/auth";
import { afterCommit } from "#lib/server/db/serialize.ts";

import { generatedServerModules } from "./hooks.gen.ts";

/** What a module gets to know about an order. All of the current tenant's. */
export interface OrderFacts {
	id: number;
	type: OrderType;
	status: OrderStatus;
	equipmentId: number | null;
	createdAt: Date;
}

/** An order with its price before adjustments, in cents. */
interface PricedOrderFacts extends OrderFacts {
	materials: number;
	labor: number;
}

/** What happened to an order that core has saved. */
export interface OrderChange {
	number: string;
}

/** The hooks a module can implement; it implements the ones it needs. */
export interface ServerModule {
	orders?: {
		/** Collector: changes to orders' prices, e.g. the work a contract includes, as a discount. */
		adjustPrices?(orders: PricedOrderFacts[]): Promise<Map<number, PriceAdjustment[]>>;
		/** Collector: badges for orders, e.g. a response time about to be missed (at `now`). */
		tag?(orders: OrderFacts[], now: Date): Promise<Map<number, OrderTag[]>>;
		/**
		 * Event after commit: core has saved an order. Refreshes the module's own queries about it
		 * (e.g. what its card on the order's page shows), so they come back with the save, like core's.
		 */
		committed?(change: OrderChange): void | Promise<void>;
	};
	billing?: {
		/**
		 * Collector: what a customer owes for besides orders, e.g. a contract's monthly fees: the
		 * items that became due in `period` (both days inclusive). Whoever bills them (the invoicing
		 * module) remembers which references it billed and leaves those out.
		 */
		billableItems?(customerId: number, period: BillingPeriod): Promise<BillableItem[]>;
	};
}

/** Declares a module's server hooks (`id` is checked against the module registry). */
export function defineServerModule<const Hooks extends ServerModule>(id: ModuleId, hooks: Hooks) {
	return { id, ...hooks };
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

/**
 * Each module's server hooks, in registry order: the folders in `src/modules` by id (their
 * `server/index.ts`, via `hooks.gen.ts`), like `modules` in `#lib/modules/manifests.ts`. A module without
 * any isn't listed. A function, so that a module can import `defineServerModule()` from here.
 */
function serverModules(): { [Id in ModuleId]?: ServerModule } {
	const generated: readonly ({ id: ModuleId } & ServerModule)[] = generatedServerModules();
	return Object.fromEntries(generated.map((module) => [module.id, module]));
}

/**
 * Refuses the current tenant a module's routes unless it has the module: a 404, as if they didn't
 * exist. The route stubs that `scripts/modules.ts` writes call it through the guards below: the
 * `+layout.server.ts` of each `(modules)` group (`guardModuleRoute()`), so a tenant without the
 * module gets the app's own 404 page inside the app layout, and each server `load`, form action
 * and request handler of a module's route (`guarded()`, `guardedActions()`), which Kit runs
 * without waiting for that layout. The module's remote functions still start with
 * `requireModule()` themselves: no route guards them.
 */
function guardModule(id: ModuleId) {
	requireModule(id);
}

/**
 * The guard of a `(modules)` route group: refuses the tenants without the module that owns the
 * route (`owners`: the route id of each route folder in the group → its module), and every route
 * there that no module owns.
 */
export function guardModuleRoute(
	routeId: string | null,
	owners: Readonly<Record<string, ModuleId>>,
) {
	const folder = Object.keys(owners).find((id) => routeId === id || routeId?.startsWith(`${id}/`));
	if (!folder) error(404, m.common_error_not_found());
	guardModule(owners[folder]);
}

/** A server `load` or request handler of module `id`'s route that refuses tenants without it first. */
export function guarded<Event, Result>(id: ModuleId, handler: (event: Event) => Result) {
	return (event: Event): Result => {
		guardModule(id);
		return handler(event);
	};
}

/** The form actions of module `id`'s page, each refusing tenants without it first. */
export function guardedActions<Actions extends Record<string, (event: never) => unknown>>(
	id: ModuleId,
	actions: Actions,
): Actions {
	return Object.fromEntries(
		Object.entries(actions).map(([name, action]) => [name, guarded(id, action)]),
	) as Actions;
}

/** The server hooks of the `enabled` modules (by default the current tenant's). */
export function enabledServerModules(
	enabled: readonly string[] = requireTenant().modules,
): ServerModule[] {
	return Object.entries(serverModules()).flatMap(([id, module]) =>
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
		modules.flatMap((module) => (module.orders?.tag ? [module.orders.tag(orders, now)] : [])),
	);
	return orders.map((order) => answers.flatMap((tags) => tags.get(order.id) ?? []));
}

/**
 * Lets the modules refresh what they show about an order that core has saved, once the
 * transaction it was saved in (if any) has committed.
 */
export function orderCommitted(change: OrderChange, modules = enabledServerModules()) {
	for (const module of modules) {
		if (module.orders?.committed) afterCommit(() => module.orders!.committed!(change));
	}
}

/** The modules' billable items for a customer in `period`, by date. */
export async function billableItems(
	customerId: number,
	period: BillingPeriod,
	modules = enabledServerModules(),
): Promise<BillableItem[]> {
	const answers = await Promise.all(
		modules.flatMap((module) =>
			module.billing?.billableItems ? [module.billing.billableItems(customerId, period)] : [],
		),
	);
	return answers.flat().sort((a, b) => a.date.getTime() - b.date.getTime());
}
