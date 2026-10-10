/**
 * The app's optional modules: feature sets on top of the core (customers, equipment, orders, …)
 * that some tenants buy and others don't. Which tenant has which is stored per organization
 * (`organization_module`); the set a module makes its remote functions with (`moduleRemote()` in
 * `#lib/server/remote-functions.ts`) refuses them to the others.
 *
 * A module keeps to itself so it can be switched off: its routes live under `route`, and its
 * tables reference the core tables, never the other way round. Core pages and core server code
 * don't import a module's code; they take what the tenant's modules contribute through these
 * registries. A module is a folder `src/modules/<id>/` whose `module.ts` is a `defineModule()` (see
 * `#lib/modules/define.ts`), which `scripts/modules.ts` collects in `manifests.gen.ts`:
 *
 * - here, `slots`: components a module adds to core pages (the dashboard, an order's page, a unit
 *   of equipment's page), rendered by `module-slots.svelte` in `src/routes/(app)/` only for the
 *   modules the tenant has;
 * - here too, `bulkActions`: actions a module adds to a core table's selection (e.g. invoicing's
 *   "Create invoice" on the orders list), loaded by `module-bulk-actions.svelte.ts` in
 *   `src/routes/(app)/` only for the modules the tenant has;
 * - `#lib/server/modules/hooks.ts`: server hooks, grouped by the core domain they belong to and named
 *   for their kind (a collector, an event after commit), e.g. `orders.adjustPrices` (applied by
 *   `priceOrders()` in `#lib/orders/server/pricing.ts`), `orders.tag` (`tagOrders()`) and
 *   `orders.committed` (`orderCommitted()`).
 */
import type { RouteId } from "$app/types";
import type { Component } from "svelte";

import type { Sentence, SubjectType } from "#lib/activity";
import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import type { OrderStatus } from "#lib/models.ts";
import type { ModuleId } from "#lib/modules/ids.ts";

import { manifests } from "./manifests.gen.ts";

/** The places on core pages where modules can add components, with the props each passes. */
export interface SlotProps {
	/** Cards on the dashboard, below the headline numbers (laid out in two columns). */
	dashboard: Record<string, never>;
	/** Cards in the side column of an order's page. */
	order: { number: string };
	/** Cards in the side column of a unit of equipment's page. */
	equipment: { serialNumber: string };
}

export type SlotName = keyof SlotProps;

/** Loads a slot's component, so a tenant without the module doesn't download it. */
type SlotLoader<Name extends SlotName> = () => Promise<{
	default: Component<SlotProps[Name]>;
}>;

/** What a module contributes besides its name; both its manifest and its registry entry have it. */
interface ModuleParts {
	/** The route id of the module's section, for `resolve()`. */
	route: RouteId;
	icon: Component;
	/**
	 * What the module adds to core pages. The components load their own data through the module's
	 * remote functions (made with `moduleRemote()`), and render nothing when they have
	 * nothing to say.
	 */
	slots?: { [Name in SlotName]?: SlotLoader<Name> };
	/** How the activity log reads for the module's records, by subject type (`#lib/activity/subjects.ts`). */
	subjects?: Record<string, SubjectType>;
	/**
	 * The verbs the module adds to the activity log (`ActivityAction`), as a sentence each. They
	 * read for every tenant, also after the module is switched off.
	 */
	actions?: Record<string, Sentence>;
	/**
	 * Bulk actions the module adds to core tables' selections (see `BulkActionRows`), after the
	 * table's own. Their commands are made with `moduleRemote()`.
	 */
	bulkActions?: { [Table in BulkTableName]?: BulkActionLoader<Table> };
}

/** A module as the registry has it. */
export interface AppModule extends ModuleParts {
	/** Also in `moduleIds` (`#lib/modules/ids.ts`), for code that can't import the registry. */
	id: ModuleId;
	/** Translated when read (a getter), so read it when showing it, not at module scope. */
	readonly label: string;
	readonly description: string;
}

/**
 * A module as its `module.ts` writes it (see `defineModule()`): message functions instead of
 * texts, so it can name them at module scope and they are read when shown.
 */
export interface ModuleManifest<Id extends string = string> extends ModuleParts {
	/** The module's folder name in `src/modules`. */
	id: Id;
	label: () => string;
	description: () => string;
}

/** An order as a module's bulk action sees a selected row of the orders list. */
export interface OrderBulkRow {
	id: number;
	number: string;
	status: OrderStatus;
	customer: { id: number; code: string; name: string };
}

/** The core tables where modules can add bulk actions, with the rows each passes. */
interface BulkActionRows {
	orders: OrderBulkRow;
}

export type BulkTableName = keyof BulkActionRows;

/**
 * A module's bulk actions for a table, as the table runs them: on a server-side list's `where`.
 */
export type TableBulkAction<Table extends BulkTableName> = BulkAction<
	BulkActionRows[Table],
	AnyListWhere
>;

/** Loads a module's bulk actions for a table, so a tenant without the module doesn't download them. */
export type BulkActionLoader<Table extends BulkTableName> = () => Promise<{
	default: TableBulkAction<Table>[];
}>;

/** All the modules in registry order: the folders in `src/modules` by id (`scripts/modules.ts`). */
export const modules = manifests satisfies readonly AppModule[];

export type { ModuleId };

/** The activity verbs of all modules, e.g. `issued`. */
export type ModuleAction = ActionsOf<(typeof modules)[number]>;
type ActionsOf<Module> = Module extends { actions: infer Actions } ? keyof Actions & string : never;

/** What a module adds at a slot: its component's loader, with the module's id. */
export interface SlotContribution<Name extends SlotName> {
	id: ModuleId;
	load: SlotLoader<Name>;
}

/**
 * The components that the `enabled` modules add at `name`, by module, in registry order. Each is
 * rendered on its own (see `module-slots.svelte`), so one that fails doesn't take the page down.
 */
export function slotLoaders<Name extends SlotName>(
	name: Name,
	enabled: readonly string[],
	registry: readonly AppModule[] = modules,
): SlotContribution<Name>[] {
	return registry.flatMap(({ id, slots }) => {
		const load = slots?.[name];
		return load && enabled.includes(id) ? [{ id, load }] : [];
	});
}

/** The loaders of the bulk actions that the `enabled` modules add to `table`, in registry order. */
export function bulkActionLoaders<Table extends BulkTableName>(
	table: Table,
	enabled: readonly string[],
	registry: readonly AppModule[] = modules,
): BulkActionLoader<Table>[] {
	return registry.flatMap((module) => {
		const load = module.bulkActions?.[table];
		return load && enabled.includes(module.id) ? [load] : [];
	});
}

// --- What modules add to orders (see `#lib/server/modules/hooks.ts`) -------------------------------

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
