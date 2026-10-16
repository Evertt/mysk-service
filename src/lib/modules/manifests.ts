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

import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import type { CoreNavId } from "#lib/modules/nav.ts";

import { manifests } from "./manifests.gen.ts";

/** What a module contributes besides its name; both its manifest and its registry entry have it. */
interface ModuleParts {
	/** The route id of the module's section, for `resolve()`. */
	route: RouteId;
	/**
	 * The route id of the page where the module is set up (e.g. checklists' templates), which the
	 * settings page links to while the module is on.
	 */
	settings?: RouteId;
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
	/**
	 * Where its sidebar entry goes: right after a core entry or another module's (`placeNav()` in
	 * `#lib/modules/nav.ts`). Without it, or while that entry isn't shown, it's in the Modules group.
	 * A literal, like `requires`.
	 */
	nav?: { after: CoreNavId | ModuleId };
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
