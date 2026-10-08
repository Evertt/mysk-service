/**
 * The app's optional modules: feature sets on top of the core (customers, equipment, orders, …)
 * that some tenants buy and others don't. Which tenant has which is stored per organization
 * (`organization_module`); `requireModule()` in `#lib/server/session.ts` refuses a module's remote
 * functions to the others.
 *
 * A module keeps to itself so it can be switched off: its routes live under `route`, its
 * components in `#lib/components/<id>/`, and its tables reference the core tables, never the
 * other way round. Core pages and core server code don't import a module's code; they take what
 * the tenant's modules contribute through these registries:
 *
 * - here, `slots`: components a module adds to core pages (the dashboard, an order's page, a unit
 *   of equipment's page), rendered by `module-slots.svelte` in `src/routes/(app)/` only for the
 *   modules the tenant has;
 * - here too, `bulkActions`: actions a module adds to a core table's selection (e.g. invoicing's
 *   "Create invoice" on the orders list), loaded by `module-bulk-actions.svelte.ts` in
 *   `src/routes/(app)/` only for the modules the tenant has;
 * - `#lib/server/modules.ts`: server hooks, e.g. adjusting an order's price (applied by
 *   `priceOrders()` in `#lib/server/pricing.ts`) or tagging orders (`tagOrders()`).
 */
import type { RouteId } from "$app/types";
import FileCheckIcon from "@lucide/svelte/icons/file-check";
import ReceiptTextIcon from "@lucide/svelte/icons/receipt-text";
import type { Component } from "svelte";

import type { Sentence, SubjectType } from "#lib/activity.js";
import { contractSubjects } from "#lib/components/contracts/activity.js";
import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.js";
import { invoicingActions, invoicingSubjects } from "#lib/components/invoicing/activity.js";
import type { OrderStatus } from "#lib/models.js";
import type { ModuleId } from "#lib/module-ids.js";
import { m } from "#lib/paraglide/messages.js";

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
export type SlotLoader<Name extends SlotName> = () => Promise<{
	default: Component<SlotProps[Name]>;
}>;

export interface AppModule {
	/** Also in `moduleIds` (`#lib/module-ids.ts`), for code that can't import the registry. */
	id: ModuleId;
	/** Translated when read (a getter), so read it when showing it, not at module scope. */
	readonly label: string;
	readonly description: string;
	/** The route id of the module's section, for `resolve()`. */
	route: RouteId;
	icon: Component;
	/**
	 * What the module adds to core pages. The components load their own data through the module's
	 * remote functions (which start with `requireModule()`), and render nothing when they have
	 * nothing to say.
	 */
	slots?: { [Name in SlotName]?: SlotLoader<Name> };
	/** How the activity log reads for the module's records, by subject type (`#lib/activity.ts`). */
	subjects?: Record<string, SubjectType>;
	/**
	 * The verbs the module adds to the activity log (`ActivityAction`), as a sentence each. They
	 * read for every tenant, also after the module is switched off.
	 */
	actions?: Record<string, Sentence>;
	/**
	 * Bulk actions the module adds to core tables' selections (see `BulkActionRows`), after the
	 * table's own. Their commands start with `requireModule()`.
	 */
	bulkActions?: { [Table in BulkTableName]?: BulkActionLoader<Table> };
}

/** An order as a module's bulk action sees a selected row of the orders list. */
export interface OrderBulkRow {
	id: number;
	number: string;
	status: OrderStatus;
	customer: { id: number; code: string; name: string };
}

/** The core tables where modules can add bulk actions, with the rows each passes. */
export interface BulkActionRows {
	orders: OrderBulkRow;
}

export type BulkTableName = keyof BulkActionRows;

/**
 * A module's bulk actions for a table, as the table runs them: on a server-side list's `where`
 * (TRANSITIONAL: only lists with a definition can have them).
 */
export type TableBulkAction<Table extends BulkTableName> = BulkAction<
	BulkActionRows[Table],
	AnyListWhere
>;

/** Loads a module's bulk actions for a table, so a tenant without the module doesn't download them. */
export type BulkActionLoader<Table extends BulkTableName> = () => Promise<{
	default: TableBulkAction<Table>[];
}>;

export const modules = [
	{
		id: "contracts",
		get label() {
			return m.contracts_module_name();
		},
		get description() {
			return m.contracts_module_description();
		},
		route: "/(app)/contracts",
		icon: FileCheckIcon,
		slots: {
			dashboard: () => import("#lib/components/contracts/dashboard-cards.svelte"),
			order: () => import("#lib/components/contracts/order-coverage.svelte"),
			equipment: () => import("#lib/components/contracts/equipment-coverage.svelte"),
		},
		subjects: contractSubjects,
	},
	{
		id: "invoicing",
		get label() {
			return m.invoices_module_name();
		},
		get description() {
			return m.invoices_module_description();
		},
		route: "/(app)/invoices",
		icon: ReceiptTextIcon,
		slots: {
			dashboard: () => import("#lib/components/invoicing/dashboard-cards.svelte"),
			order: () => import("#lib/components/invoicing/order-invoice.svelte"),
		},
		subjects: invoicingSubjects,
		actions: invoicingActions,
		bulkActions: {
			orders: () => import("#lib/components/invoicing/order-bulk-actions.js"),
		},
	},
] as const satisfies readonly AppModule[];

export type { ModuleId };

/** The activity verbs of all modules, e.g. `issued`. */
export type ModuleAction = ActionsOf<(typeof modules)[number]>;
type ActionsOf<Module> = Module extends { actions: infer Actions } ? keyof Actions & string : never;

/** The loaders of the components that the `enabled` modules add at `name`, in registry order. */
export function slotLoaders<Name extends SlotName>(
	name: Name,
	enabled: readonly string[],
): SlotLoader<Name>[] {
	return (modules as readonly AppModule[]).flatMap((module) => {
		const load = module.slots?.[name];
		return load && enabled.includes(module.id) ? [load] : [];
	});
}

/** The loaders of the bulk actions that the `enabled` modules add to `table`, in registry order. */
export function bulkActionLoaders<Table extends BulkTableName>(
	table: Table,
	enabled: readonly string[],
): BulkActionLoader<Table>[] {
	return (modules as readonly AppModule[]).flatMap((module) => {
		const load = module.bulkActions?.[table];
		return load && enabled.includes(module.id) ? [load] : [];
	});
}

// --- What modules add to orders (see `#lib/server/modules.ts`) -------------------------------

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
