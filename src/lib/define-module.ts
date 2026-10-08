import type { ModuleManifest } from "#lib/modules.js";

/**
 * Declares a module in its `module.ts` (`src/modules/<id>/module.ts`, default export), checked
 * against core's extension points (`ModuleManifest`). The registry in `#lib/modules.ts` gets the
 * manifests from `modules.gen.ts` and reads `label` and `description` as plain texts, so they
 * are getters here, translated when read.
 *
 * Kept apart from the registry so a `module.ts` can import it without the registry (which imports
 * every `module.ts`) coming back round to the module that is still loading.
 *
 * A `module.ts` is in every tenant's bundle, so it imports nothing but messages, icons, types,
 * `import()` loaders and its own small files (`activity.ts`, `labels.ts`); see
 * `src/modules/boundaries.spec.ts`.
 */
export function defineModule<const Manifest extends ModuleManifest>(manifest: Manifest) {
	return {
		...manifest,
		get label() {
			return manifest.label();
		},
		get description() {
			return manifest.description();
		},
	} as Omit<Manifest, "label" | "description"> & {
		readonly label: string;
		readonly description: string;
	};
}
