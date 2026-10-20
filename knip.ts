import type { KnipConfig } from "knip";

/**
 * Unused files, exports and dependencies: `pnpm knip` (a few seconds). Fix what it reports, or, for
 * code that is used in a way knip can't follow, say so here with a comment why.
 *
 * Knip skips what git ignores, so the generated files (`*.gen.ts`, the route stubs for the modules,
 * paraglide's output) are not part of what it checks; the entries below stand in for what they
 * import.
 */
const config: KnipConfig = {
	entry: [
		// SvelteKit's files that Kit itself calls (this project has no svelte.config.js, which is
		// where knip's plugin would learn about them): the typed environment variables.
		"src/hooks.ts",
		"src/env.ts",
		// Run by drizzle-kit (`drizzle.config.ts` reads `DATABASE_URL`, so knip's plugin can't).
		"drizzle.config.ts",
		// The modules' files that `scripts/modules.ts` links into the app: the registries import the
		// manifests, server halves and contributions to extension points, and the route stubs import
		// the routes (all generated).
		"src/modules/*/module.ts",
		"src/modules/*/server/{index,schema,seed}.ts",
		"src/modules/*/slots/*/*.svelte",
		"src/modules/*/skeletons/**/page.svelte",
		"src/modules/*/bulk-actions/*.ts",
		"src/modules/*/columns/*.ts",
		"src/modules/*/server/columns/*.ts",
		"src/modules/*/routes/**/+*.{ts,svelte}",
		// (`AnySlotContribution` and `AnyBulkContribution` in `src/lib/extensions/define.ts` are tagged
		// `@public` for the same reason: only the generated `contributions.gen.ts` imports them; so are
		// the enum types that only a generated `labels.gen.ts` reads.)
		// The tests of every Vitest project: `src/tests/{unit,e2e}/` and the modules' `tests/{unit,e2e}/`.
		"src/**/*.{test,spec}.{ts,js}",
		"scripts/**/*.spec.ts",
		// The Worker on Cloudflare (`wrangler.jsonc`'s `main`), its migrations' config (run by
		// drizzle-kit through `scripts/db-generate.ts`) and its export script, run by hand.
		"cloudflare/{entry,drizzle.config,export-database}.ts",
		// The service worker experiment's measurements, run by hand (`node scripts/sw-benchmark.ts`).
		"scripts/sw-{benchmark,check,deploy,files,probe}.ts",
		// The energy module's simulator, run by hand (`node src/modules/energy/server/simulator.ts`).
		"src/modules/energy/server/simulator.ts",
	],
	// (`.vue` is only here to silence a hint: knip's unplugin-auto-import plugin registers a Vue
	// compiler, and says so when no project pattern mentions the extension. There are no Vue files.)
	project: ["src/**/*.{ts,svelte,css,vue}", "scripts/**/*.ts", "cloudflare/*.ts", "*.ts"],
	// `cloudflare:workers` is the Workers runtime's own module, not a package.
	ignoreDependencies: ["cloudflare"],
	// The worker SvelteKit's adapter writes, which exists only after `pnpm build:cloudflare` (not in
	// CI); typed by `cloudflare/kit-worker.d.ts`.
	ignoreUnresolved: ["#kit-worker"],
	ignore: [
		// shadcn-svelte's components are kept whether or not they are used, and `vite.config.ts`
		// auto-imports them (`<Card.Root>` without an import), so knip sees no uses of them.
		"src/lib/components/ui/**",
	],
	// Would load `drizzle.config.ts`, which throws without `DATABASE_URL`.
	drizzle: false,
	compilers: {
		// `layout.css` imports the tailwind plugins and fonts: `@import "x"` and `@plugin 'x'`.
		css: (text: string) =>
			[...text.matchAll(/@(?:import|plugin)\s+["']([^"']+)["']/g)]
				.map(([, specifier]) => `import "${specifier}";`)
				.join("\n"),
	},
};

export default config;
