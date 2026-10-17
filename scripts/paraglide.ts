/**
 * How Paraglide compiles the messages (`project.inlang`) into JavaScript, shared by the Vite plugin
 * (`vite.config.ts`) and `pnpm generate` (`scripts/generate.ts`).
 *
 * Paraglide writes a folder of modules, and every Vite instance (dev server, build, each Vitest
 * project, the end-to-end tests' build) compiles it anew when it starts. It writes only the files
 * whose content changed, in place, so writers that agree leave the folder alone, and readers never
 * see it change. There are two layouts, so two folders, each with writers that agree:
 *
 * - `src/lib/paraglide`, a module per language: the dev server, the tests and `pnpm generate`, with
 *   the same options (so `generate` doesn't change what the dev server and the tests read). The app
 *   imports it as `#lib/paraglide/…`, and its type declarations are what the type check reads.
 * - `.svelte-kit/paraglide`, a module per message: the production builds (`pnpm build`,
 *   Cloudflare's, the end-to-end tests'), which import `#lib/paraglide/…` from there. A module per
 *   message lets the bundler put each page's messages in its page's chunk: per language, every page
 *   loaded one chunk with all the messages in both languages (some 300 kB). With one folder for
 *   both, a build swapped ~2,900 modules in under the tests and a running dev server, and they
 *   swapped them back under the build ("Could not resolve './activity_action_accepted.js'").
 */
import { resolve, sep } from "node:path";

import type { Plugin } from "vite-plus";

/** The options both layouts are compiled with. */
export const paraglideOptions = {
	project: "./project.inlang",
	// A chosen language (cookie) wins, then the browser's language, then Dutch (the tenants are
	// mainly Dutch; `#lib/i18n/fallback-locale.ts`). English stays the base locale.
	strategy: ["cookie", "preferredLanguage", "custom-dutch", "baseLocale"],
} as const;

/** The folder of each layout, relative to the project root. */
export const paraglideOutdirs = {
	"locale-modules": "./src/lib/paraglide",
	"message-modules": "./.svelte-kit/paraglide",
} as const;

/** The layout this Vite instance compiles: a module per message in a production build. */
export function paraglideOutputStructure(): keyof typeof paraglideOutdirs {
	return process.env.NODE_ENV === "production" ? "message-modules" : "locale-modules";
}

/**
 * Points `#lib/paraglide/…` at the folder of the layout this instance compiles, and refuses the
 * other folder's modules: a relative import of `src/lib/paraglide` in a production build would
 * bundle a second runtime, with a locale of its own.
 */
export function paraglideOutput(root: string): Plugin {
	const structure = paraglideOutputStructure();
	const outdir = (layout: keyof typeof paraglideOutdirs) => resolve(root, paraglideOutdirs[layout]);
	const own = outdir(structure);
	const other = outdir(structure === "message-modules" ? "locale-modules" : "message-modules");
	return {
		name: "fieldworks:paraglide-output",
		config: () => ({ resolve: { alias: { "#lib/paraglide": own } } }),
		load(id) {
			if (id.startsWith(other + sep)) {
				this.error(
					`${id} is Paraglide's other layout: import the messages as "#lib/paraglide/…" (scripts/paraglide.ts).`,
				);
			}
		},
	};
}
