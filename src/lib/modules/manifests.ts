/**
 * The app's optional modules: feature sets on top of the core (customers, equipment, orders, …)
 * that some tenants buy and others don't. Which tenant has which is stored per organization
 * (`organization_module`); the set a module makes its remote functions with (`moduleRemote()` in
 * `#lib/server/remote-functions.ts`) refuses them to the others.
 *
 * A module keeps to itself so it can be switched off: its routes live under its own URL, `/<id>`, and
 * its tables reference the core tables, never the other way round. Core pages and core server code
 * don't import a module's code; they take what the tenant's modules contribute through the
 * registries `scripts/modules.ts` generates. A module is a folder `src/modules/<id>/` whose
 * `module.ts` is a `defineModule()` (see `#lib/modules/define.ts`), which the generator collects in
 * `manifests.gen.ts`. What a module adds to its owners' extension points (see
 * `#lib/extensions/define.ts`) isn't in its manifest: components at slots and bulk actions are
 * files (`slots/`, `bulk-actions/`, listed in `#lib/extensions/contributions.gen.ts`), and hooks
 * are in its `server/index.ts` (see `#lib/server/extensions.ts`). Nor are the pages the core links
 * to: they're where its `routes/` has them (`modulePages`).
 */
import type { Component } from "svelte";

import type { Sentence, SubjectType } from "#lib/activity/index.ts";
import type { OrderType } from "#lib/models.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import type { CoreNavId } from "#lib/modules/nav.ts";

import { manifests } from "./manifests.gen.ts";
import { generatedIntegrationModules, generatedModulePages } from "./pages.gen.ts";

/** What a module contributes besides its name; both its manifest and its registry entry have it. */
interface ModuleParts {
	icon: Component;
	/** How the activity log reads for the module's records, by subject type (`#lib/activity/subjects.ts`). */
	subjects?: Record<string, SubjectType>;
	/**
	 * The types the module announces changes of for its live queries but never logs (e.g. energy's
	 * meter readings): a live query may watch them; the activity log never names them.
	 */
	liveTypes?: readonly string[];
	/**
	 * The verbs the module adds to the activity log (`ActivityAction`), as a sentence each. They
	 * read for every tenant, also after the module is switched off.
	 */
	actions?: Record<string, Sentence>;
	/**
	 * Modules that must be on for this one to be on. Literal ids: the generator reads them from
	 * `module.ts`'s syntax, and orders the registries by them.
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
	/**
	 * The entry of its page in the customer portal (`routes/(customer)/portal/+page.svelte`, e.g. the
	 * partner programme's bonus), which a module with that page has and one without hasn't: in the
	 * portal's navigation for the tenants that have it, after the portal's own. Its label is a message
	 * function, read when shown.
	 */
	portal?: { label: () => string; icon: Component };
	/**
	 * The order types the module makes orders of or works with (e.g. maintenance plans'), which a
	 * tenant can't hide from the order form while the module is on (`requiredOrderTypes()` in
	 * `#lib/orders/server/types.ts`).
	 */
	orderTypes?: readonly OrderType[];
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

type Pages = typeof generatedModulePages;
/** The route ids of all modules' pages of one kind, e.g. every module's settings. */
type PagesOf<Kind extends string> = {
	[Id in keyof Pages]: Pages[Id] extends Record<Kind, infer Route> ? Route : never;
}[keyof Pages];

/**
 * The pages of a module that the core links to, as route ids for `resolve()`, by where its
 * `routes/` has them (`modulePages()` in `scripts/modules/routes.ts`): its section
 * (`routes/(app)/+page.svelte`, the sidebar's entry), its settings (`routes/(app)/settings/`, which
 * the organization's settings link to while it's on; every member reads it, managers change it) and
 * its page in the customer portal (`routes/(customer)/portal/`, with `portal` for its entry).
 */
export interface ModulePages {
	home?: PagesOf<"home">;
	settings?: PagesOf<"settings">;
	portal?: PagesOf<"portal">;
}

/** Each module's pages (see `ModulePages`), by its id. */
export const modulePages: Record<ModuleId, ModulePages> = generatedModulePages;

/**
 * The modules with integration endpoints (`routes/(api)/`, for systems outside the app): their
 * settings pages keep the tokens those post with (`<IntegrationTokensCard>`).
 */
export const integrationModules = generatedIntegrationModules;

export type IntegrationModuleId = (typeof integrationModules)[number];

/** The activity verbs of all modules, e.g. `issued`. */
export type ModuleAction = ActionsOf<(typeof modules)[number]>;
type ActionsOf<Module> = Module extends { actions: infer Actions } ? keyof Actions & string : never;

/** The subject types of all modules, e.g. `invoice`. */
export type ModuleSubjectType = SubjectsOf<(typeof modules)[number]>;
type SubjectsOf<Module> = Module extends { subjects: infer Subjects }
	? keyof Subjects & string
	: never;

/** The live-only types of all modules (`liveTypes`), e.g. `energy_reading`. */
export type ModuleLiveType = LiveTypesOf<(typeof modules)[number]>;
type LiveTypesOf<Module> = Module extends { liveTypes: readonly (infer Type extends string)[] }
	? Type
	: never;
