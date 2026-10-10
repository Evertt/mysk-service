import { generatedModuleGraph, generatedModuleIds } from "./ids.gen.ts";

/**
 * The ids of the optional modules, in registry (dependency) order: the plain list, for code that can't import
 * the registry in `#lib/modules/manifests.ts` because that registers Svelte components (the
 * `org:create` script, which runs in plain Node) or doesn't want to carry them along (the tenant
 * loader). Every module in the registry must have its id here, and the other way round (checked by
 * `modules.spec.ts`). Both come from the folders in `src/modules` (`scripts/modules.ts`).
 */
export const moduleIds = generatedModuleIds;

export type ModuleId = (typeof moduleIds)[number];

/** Where a module stands among the others, see `ModuleParts` in `#lib/modules/manifests.ts`. */
export interface ModuleNode {
	/** Modules that must be on for this one to be on. */
	requires: readonly ModuleId[];
	/** Modules this one adds to when they're on, without needing them. */
	enhances: readonly ModuleId[];
	/** Always on for every tenant: it has no switch. */
	alwaysOn: boolean;
}

/**
 * The graph of the modules, from their `module.ts` (`scripts/modules.ts`, which refuses unknown
 * ids and cycles in `requires`), so `moduleIds` lists every module after the ones it requires.
 */
export const moduleGraph = generatedModuleGraph as Readonly<Record<ModuleId, ModuleNode>>;

/** Whether `id` is one of the modules, e.g. one read from the database. */
export const isModuleId = (id: string): id is ModuleId =>
	(moduleIds as readonly string[]).includes(id);
