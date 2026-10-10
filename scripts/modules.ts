/**
 * Links the optional modules in `src/modules/<id>/` into the app. Run it with `node scripts/modules.ts`
 * (`pnpm generate` does, before `svelte-kit sync`), at the top of `vite.config.ts` (so Vite, Vitest
 * and Kit see the output) and, in dev, by `modulesPlugin()` below whenever a module's files change.
 * Everything it writes is generated and gitignored, except the module entries of `pathPattern` in
 * `project.inlang/settings.json`. It writes a file only when its content changes, so it is safe to
 * run again and again, and from several processes at once.
 *
 * For each folder with a `module.ts` it:
 *
 * - writes the registries that core reads, next to the code that reads them (`*.gen.ts`): the
 *   manifests (`src/lib/modules/manifests.gen.ts`), the plain list of ids for code that runs in plain Node
 *   (`src/lib/modules/ids.gen.ts`), the server halves (`server/index.ts`, in
 *   `src/lib/server/modules/hooks.gen.ts`), the tables (`server/schema.ts`, in
 *   `src/lib/server/db/modules.gen.ts`), the seeders (`server/seed.ts`, in
 *   `src/lib/server/db/module-seeds.gen.ts`) and what it contributes to extension points by file
 *   (`slots/<point id>/<name>.svelte`, `bulk-actions/<point id>.ts`, in
 *   `src/lib/extensions/contributions.gen.ts`, each held to its point's types);
 * - writes a stub in `src/routes` for every `+` file under the module's `routes/`, in a `(modules)`
 *   group inside the file's leading groups: `routes/(app)/contracts/[number]/+page.svelte` becomes
 *   `src/routes/(app)/(modules)/contracts/[number]/+page.svelte` (route id
 *   `/(app)/(modules)/contracts/[number]`, URL `/contracts/…`), so the routes are real ones (typed
 *   `./$types`, `RouteId`, the groups' layouts, endpoints, code splitting, and SvelteKit's
 *   server-only guard, which only follows files under `src/routes`) and the core's route folders
 *   hold only the core's files. Components become a wrapper that passes its props on; scripts name
 *   their exports again, and copy the page options that are literals (`export const ssr = false`),
 *   because SvelteKit reads those without running the file, and gives up on `export * from`. Every
 *   `(modules)` folder in `src/routes` is the generator's (gitignored): it deletes and rewrites it,
 *   and stops when one holds a file it didn't write. It also removes the stubs its earlier versions
 *   wrote beside the core's route folders;
 * - guards the modules' routes: a `+layout.server.ts` in each `(modules)` group refuses the
 *   tenants without the module that owns the route (`guardModuleRoute()`, with the route folders'
 *   owners), and since Kit runs server loads in parallel, and form actions and endpoints without
 *   layouts, the stub of each server file guards its `load`, `actions` and request handlers itself
 *   (`guarded()`, `guardedActions()`);
 * - lists the module's message files in `pathPattern`: the core's entries first, then each module's,
 *   in id order;
 * - checks the rules and stops with the full list of what's wrong: a module's folder name is its id
 *   (`^[a-z][a-z0-9-]*$`); its route folders are plain names of their own (not a core route's, nor
 *   another module's); its message sections (`messages/<locale>/<section>.json`) are in every
 *   language and unique across the app; an extension point's id starts with its owner's and is
 *   unique, and a contribution names an existing point of its kind whose owner is core, the module
 *   itself, or a module it requires or enhances.
 *
 * It uses no packages besides the parser of Vite+, and imports no app code, so it runs in plain Node.
 * The work is split by what it does, in `scripts/modules/`: `find.ts` (the folders), `routes.ts`
 * and `stubs.ts` (the route stubs), `registries.ts`, `extensions.ts` (the extension points and
 * the contributions to them), `messages.ts`, `check.ts` (the rules), `generate.ts` (writing it all)
 * and `watch.ts` (the dev server). This file is the entry, and the name the generated files'
 * headers give.
 */
import { generateModules } from "./modules/generate.ts";

export { generateModules } from "./modules/generate.ts";
export { modulesPlugin } from "./modules/watch.ts";

if (import.meta.main) {
	const { modules, changed } = generateModules(process.cwd());
	if (changed.length) {
		console.log(`Linked ${modules.length} modules (${changed.length} files written).`);
	}
}
