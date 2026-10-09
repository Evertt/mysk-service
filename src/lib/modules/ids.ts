import { generatedModuleIds } from "./ids.gen.ts";

/**
 * The ids of the optional modules, in registry order: the plain list, for code that can't import
 * the registry in `#lib/modules/manifests.ts` because that registers Svelte components (the
 * `org:create` script, which runs in plain Node) or doesn't want to carry them along (the tenant
 * loader). Every module in the registry must have its id here, and the other way round (checked by
 * `modules.spec.ts`). Both come from the folders in `src/modules` (`scripts/modules.ts`).
 */
export const moduleIds = generatedModuleIds;

export type ModuleId = (typeof moduleIds)[number];

/** Whether `id` is one of the modules, e.g. one read from the database. */
export const isModuleId = (id: string): id is ModuleId =>
	(moduleIds as readonly string[]).includes(id);
