/**
 * The app's optional modules: feature sets on top of the core (customers, equipment, orders, …)
 * that some tenants buy and others don't. Which tenant has which is stored per organization
 * (`organization_module`); the set a module makes its remote functions with (`moduleRemote()` in
 * `#lib/server/remote-functions.ts`) refuses them to the others.
 *
 * A module keeps to itself so it can be switched off: its routes live under `route`, and its
 * tables reference the core tables, never the other way round. Core pages and core server code
 * don't import a module's code; they take what the tenant's modules contribute through the
 * registries `scripts/modules.ts` generates. A module is a folder `src/modules/<id>/` whose
 * `module.ts` is a `defineModule()` (see `#lib/modules/define.ts`), which the generator collects in
 * `manifests.gen.ts`. What a module adds to its owners' extension points (see
 * `#lib/extensions/define.ts`) isn't in its manifest: components at slots and bulk actions are
 * files (`slots/`, `bulk-actions/`, listed in `#lib/extensions/contributions.gen.ts`), and hooks
 * are in its `server/index.ts` (see `#lib/server/extensions.ts`).
 */
import type { RouteId } from "$app/types";
import type { Component } from "svelte";

import type { Sentence, SubjectType } from "#lib/activity";
import type { AnyListWhere, BulkAction } from "#lib/components/data-table/bulk-actions.ts";
import type { cards } from "#lib/dashboard/extensions.ts";
import type { detailSide as equipmentDetailSide } from "#lib/equipment/extensions.ts";
import { bulkContributions, slotContributions } from "#lib/extensions/contributions.gen.ts";
import type {
	AnyBulkContribution,
	AnySlotContribution,
	BulkContribution,
	SlotContribution,
	SlotPoint,
} from "#lib/extensions/define.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import type { OrderBulkRow, detailSide as orderDetailSide } from "#lib/orders/extensions.ts";

import { manifests } from "./manifests.gen.ts";

/** What a module contributes besides its name; both its manifest and its registry entry have it. */
interface ModuleParts {
	/** The route id of the module's section, for `resolve()`. */
	route: RouteId;
	icon: Component;
	/** How the activity log reads for the module's records, by subject type (`#lib/activity/subjects.ts`). */
	subjects?: Record<string, SubjectType>;
	/**
	 * The verbs the module adds to the activity log (`ActivityAction`), as a sentence each. They
	 * read for every tenant, also after the module is switched off.
	 */
	actions?: Record<string, Sentence>;
	/**
	 * Modules that must be on for this one to be on. Literal ids: the generator reads them from
	 * `module.ts` with a pattern, and orders the registries by them.
	 */
	requires?: readonly ModuleId[];
	/** Modules this one adds to when they're on, but doesn't need. Literal ids, like `requires`. */
	enhances?: readonly ModuleId[];
	/** Always on for every tenant, with no switch. Literally `true` or left out, like `requires`. */
	alwaysOn?: true;
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

/** All the modules in registry order: the folders in `src/modules` by id (`scripts/modules.ts`). */
export const modules = manifests satisfies readonly AppModule[];

export type { ModuleId };

/** The activity verbs of all modules, e.g. `issued`. */
export type ModuleAction = ActionsOf<(typeof modules)[number]>;
type ActionsOf<Module> = Module extends { actions: infer Actions } ? keyof Actions & string : never;

// Temporary, removed with ExtensionSlot: the old slot and table names, read through the
// generated contributions, for `module-slots.svelte` and `module-bulk-actions.svelte.ts`.

type PropsOf<Point> = Point extends SlotPoint<infer Props> ? Props : never;

/** The points that the old slot names stand for. */
const slotPoints = {
	dashboard: "dashboard.cards",
	order: "orders.detail.side",
	equipment: "equipment.detail.side",
} as const;

/** The places on core pages where modules can add components, with the props each passes. */
export interface SlotProps {
	dashboard: PropsOf<typeof cards>;
	order: PropsOf<typeof orderDetailSide>;
	equipment: PropsOf<typeof equipmentDetailSide>;
}

export type SlotName = keyof SlotProps;

/** Loads a slot's component, so a tenant without the module doesn't download it. */
type SlotLoader<Name extends SlotName> = SlotContribution<SlotProps[Name]>["load"];

/**
 * The components that the `enabled` modules add at `name`, by module, in registry order. Each is
 * rendered on its own (see `module-slots.svelte`), so one that fails doesn't take the page down.
 */
export function slotLoaders<Name extends SlotName>(
	name: Name,
	enabled: readonly string[],
	registry: readonly AnySlotContribution[] = slotContributions,
): { id: ModuleId; load: SlotLoader<Name> }[] {
	return registry
		.filter(({ point, module }) => point === slotPoints[name] && enabled.includes(module))
		.map(({ module, load }) => ({ id: module, load: load as SlotLoader<Name> }));
}

/** The tables that the old table names stand for. */
const bulkTables = { orders: "orders.list" } as const;

/** The rows each table passes its bulk actions. */
interface BulkActionRows {
	orders: OrderBulkRow;
}

export type BulkTableName = keyof BulkActionRows;

/** A module's bulk action for a table, as the table runs it: on a server-side list's `where`. */
export type TableBulkAction<Table extends BulkTableName> = BulkAction<
	BulkActionRows[Table],
	AnyListWhere
>;

/** The loaders of the bulk actions that the `enabled` modules add to `table`, in registry order. */
export function bulkActionLoaders<Table extends BulkTableName>(
	table: Table,
	enabled: readonly string[],
	registry: readonly AnyBulkContribution[] = bulkContributions,
): BulkContribution<BulkActionRows[Table]>["load"][] {
	return registry
		.filter(({ point, module }) => point === bulkTables[table] && enabled.includes(module))
		.map(({ load }) => load as BulkContribution<BulkActionRows[Table]>["load"]);
}
