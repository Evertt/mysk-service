import { globSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { paraglideVitePlugin } from "@inlang/paraglide-js";
import autoAdapter from "@sveltejs/adapter-auto";
import cloudflareAdapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import type { ImportsMap } from "unplugin-auto-import/types";
import AutoImport from "unplugin-auto-import/vite";
import { defineConfig, lazyPlugins } from "vite-plus";
import { playwright } from "vite-plus/test/browser-playwright";

import { generateModules, modulesPlugin } from "./scripts/modules.ts";
import {
	paraglideOptions,
	paraglideOutdirs,
	paraglideOutput,
	paraglideOutputStructure,
} from "./scripts/paraglide.ts";

// Links the modules in `src/modules` into the app before anything reads `src/routes` or the
// registries (SvelteKit's sync, Vitest, the editor), see scripts/modules.ts.
generateModules(import.meta.dirname);

/**
 * Auto-import every shadcn-svelte component the way its docs import it:
 * - multi-part components as a namespace: `import * as Card from '#ui/card'` → `<Card.Root>`,
 *   `<Card.Header>`, …
 * - single-part components by their exported name: `import { Button } from '#ui/button'` →
 *   `<Button>`, `import { Toaster } from '#ui/sonner'` → `<Toaster>`
 */
function shadcnImports(): ImportsMap {
	const uiDir = "./src/lib/components/ui";
	const isPascalCase = (name: string) => /^[A-Z]\w*$/.test(name);
	const entries = readdirSync(uiDir).flatMap((name): [string, ImportsMap[string]][] => {
		const namespace = name.replace(/(?:^|-)(\w)/g, (_, c: string) => c.toUpperCase());
		const source = readFileSync(`${uiDir}/${name}/index.ts`, "utf8").replace(
			/\/\/.*|\/\*[\s\S]*?\*\//g,
			"",
		);
		// `Root`, `Root as Button`, `default as Toaster`, … (type exports excluded)
		const specifiers = [...source.matchAll(/export\s*\{([^}]*)\}/g)]
			.flatMap(([, list]) => list.split(","))
			.map((specifier) => specifier.trim())
			.filter((specifier) => specifier && !specifier.startsWith("type "))
			.map((specifier) => specifier.split(/\s+as\s+/));
		// Component parts are the un-aliased PascalCase exports (`Root`, `Header`, …).
		const parts = specifiers.filter((s) => s.length === 1 && isPascalCase(s[0]));
		// Name namespaces like shadcn does (`Root as InputOTP` → `InputOTP`, not `InputOtp`).
		const rootAlias = specifiers.find(([local, alias]) => local === "Root" && alias)?.[1];
		if (parts.length > 1) return [[`#ui/${name}`, [["*", rootAlias ?? namespace]]]];

		const exported = specifiers
			.map((s) => s.at(-1)!)
			.filter((n) => isPascalCase(n) && n !== "Root");
		const component = exported.includes(namespace) ? namespace : exported[0];
		return component ? [[`#ui/${name}`, [component]]] : [];
	});
	return Object.fromEntries(entries);
}

/** The unit tests that run in Node (`*.svelte.spec.ts` run in the browser). */
const serverSpecs = {
	// Worker threads start faster than forked processes: `vitest doctor` measured 16% off.
	pool: "threads" as const,
	environment: "node",
	// The test clock, at `TEST_NOW` if set (src/tests/clock/clock.ts), and Temporal (see the file).
	setupFiles: ["./src/tests/clock/register.ts", "./src/tests/unit/temporal-setup.ts"],
	include: [
		"src/tests/unit/**/*.{test,spec}.{js,ts}",
		"src/modules/*/tests/unit/**/*.{test,spec}.{js,ts}",
		"scripts/**/*.spec.ts",
	],
	// (The end-to-end tests are in `tests/e2e/` folders, which these globs don't reach.)
	exclude: [
		"src/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
		"src/modules/*/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
	],
};

/** The Node specs, with their source without comments (so a comment that explains a mock counts for nothing). */
const nodeSpecs = globSync(serverSpecs.include, { exclude: serverSpecs.exclude }).map((file) => ({
	file,
	code: readFileSync(file, "utf8")
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/.*$/gm, "$1"),
}));

/**
 * The Node specs that run the app's server code as a tenant on a seeded copy of the demo database
 * (the `server-harness` project): those that import the server spec harness
 * (`src/tests/unit/lib/server/harness/`, see docs/agents/tests.md). Each file gets a database of
 * its own, so they don't share modules either. Found from the source, like the isolated ones.
 */
const harnessServerSpecs = nodeSpecs
	.filter(({ code }) => code.includes("#unit/lib/server/harness/"))
	.map(({ file }) => file);

/**
 * The other Node specs that need modules of their own: those that replace a module with
 * `vi.mock()` (or friends). Most specs share their worker's modules (the `server-shared` project),
 * but a mock reaches only what imports the mocked module after it's registered: in a shared worker
 * an earlier file has already imported those against the real one, so the mock would miss, and it
 * would leak into the next file. Found from the source, so a new spec lands in the right project.
 */
const isolatedServerSpecs = nodeSpecs
	.filter(
		({ file, code }) =>
			/\bvi\.(mock|doMock|unmock|resetModules)\(/.test(code) && !harnessServerSpecs.includes(file),
	)
	.map(({ file }) => file);

export default defineConfig({
	run: {
		cache: {
			scripts: true,
			tasks: true,
		},
	},
	staged: {
		"*": "vp check --fix",
	},
	fmt: {
		useTabs: true,
		// trailingComma: 'none',
		// printWidth: 100,
		svelte: true,
		sortImports: true,
		sortTailwindcss: {
			stylesheet: "./src/routes/layout.css",
			functions: ["cn", "tv"],
		},
		ignorePatterns: [
			".agents/",
			".claude/",
			".github/",
			".opencode/",
			"src/lib/paraglide/",
			"src/auto-imports.d.ts",
			// generated by drizzle-kit
			"drizzle/",
			"cloudflare/migrations/",
			// generated by `wrangler types`
			"cloudflare/worker-configuration.d.ts",
		],
	},
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: {
			"vite-plus/prefer-vite-plus-imports": "error",
			// Flags APIs marked @deprecated in their types (e.g. SvelteKit 3's replaceState).
			"typescript/no-deprecated": "error",
		},
		ignorePatterns: [
			"src/lib/paraglide/",
			"src/auto-imports.d.ts",
			"cloudflare/migrations/",
			"cloudflare/worker-configuration.d.ts",
		],
		// Type errors are reported by svelte-check, which understands .svelte files;
		// tsgolint's typeCheck doesn't and would flag every .svelte import.
		options: { typeAware: true, typeCheck: false },
	},
	resolve: {
		alias: {
			// SvelteKit's client runtime, which keeps the page's active queries (`query_map`): the
			// service worker experiment refreshes the one whose answer changed by its key
			// (`src/routes/(app)/swr-worker.ts`). Internal, so it may move in another SvelteKit version.
			"$kit-client": fileURLToPath(
				new URL("../runtime/client/client.js", import.meta.resolve("@sveltejs/kit")),
			),
		},
	},
	// The dev server pre-bundles the dependencies it finds by scanning from the routes (SvelteKit's
	// entries), but the shadcn-svelte components are auto-imported (see `shadcnImports`), so the
	// scan doesn't reach them or what they import (e.g. their icons). Those were found on the first
	// page that used them, after the deps cache was cleared: Vite then pre-bundled them again and
	// reloaded the page. Scanning the components, and the modules' manifests (their nav icons), finds
	// them up front.
	optimizeDeps: {
		entries: ["src/lib/**/*.svelte", "src/modules/**/*.svelte", "src/modules/*/module.ts"],
	},
	plugins: lazyPlugins(() => [
		modulesPlugin(import.meta.dirname),
		AutoImport({
			include: [/\.svelte$/, /\.svelte\?svelte/, /\.ts$/],
			// Paraglide's messages (`m.title()`), and the shadcn-svelte components.
			imports: { "#lib/paraglide/messages.js": ["m"], ...shadcnImports() },
			dts: "./src/auto-imports.d.ts",
			dtsMode: "overwrite",
		}),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				experimental: { async: true },
			},

			// A Node server (`node build`), next to its SQLite database file. See "Deploying" in README.md.
			// `ADAPTER=cloudflare` (`pnpm build:cloudflare`) builds for Cloudflare: see `cloudflare/entry.ts`.
			adapter:
				process.env.ADAPTER === "cloudflare"
					? cloudflareAdapter({ config: "cloudflare/adapter.wrangler.jsonc" })
					: autoAdapter(),
			experimental: { remoteFunctions: true, forkPreloads: true },
		}),

		// Every Vite instance compiles the messages when it starts: a production build a module per
		// message into `.svelte-kit/paraglide`, anything else (the dev server, each Vitest project) a
		// module per language into `src/lib/paraglide`, with the options `pnpm generate` uses too. So
		// the writers of a folder agree, and leave it as they found it: one that swapped the folder's
		// ~2,900 modules for 6, or back, broke what was reading it (a dev server, the tests, another
		// build). `paraglideOutput` points `#lib/paraglide/…` at the folder. See scripts/paraglide.ts.
		paraglideOutput(import.meta.dirname),
		paraglideVitePlugin({
			...paraglideOptions,
			strategy: [...paraglideOptions.strategy],
			outputStructure: paraglideOutputStructure(),
			outdir: paraglideOutdirs[paraglideOutputStructure()],
			// The type check reads the dev layout's (`pnpm generate` writes them too).
			emitTsDeclarations: paraglideOutputStructure() === "locale-modules",
		}),
	]),
	test: {
		expect: { requireAssertions: true },
		// Keeps the transformed modules on disk between runs. Vitest 5.0.1 overflowed the stack reading
		// back the messages (`patches/vitest@5.0.1.patch`; docs/agents/tests.md).
		fsModuleCache: true,
		projects: [
			{
				extends: "./vite.config.ts",
				// Vite pre-bundles the dependencies it finds by scanning the test files' imports, but the
				// shadcn-svelte components are auto-imported (see `shadcnImports`), so the scan doesn't
				// reach them or what they import (e.g. their icons). Those would be found mid-run, after
				// the deps cache was cleared (e.g. by a change to the lockfile): Vite then pre-bundles
				// them again and reloads the browser, which fails the test files that were loading
				// ("Failed to fetch dynamically imported module", an iframe that isn't ready, or a second
				// copy of Svelte's runtime). Scanning the components as well finds them up front. These
				// entries replace the default ones, so they name the test files too, and every component
				// in `src/lib` (not only `ui/`: e.g. the data table's own icons).
				optimizeDeps: {
					entries: [
						"src/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
						"src/modules/*/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
						"src/lib/**/*.svelte",
						"src/modules/**/*.svelte",
						"src/modules/*/module.ts",
					],
				},
				test: {
					name: "client",
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: "chromium", headless: true }],
					},
					include: [
						"src/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
						"src/modules/*/tests/unit/**/*.svelte.{test,spec}.{js,ts}",
					],
					// Server code (`server/` folders, also the modules') doesn't run in the browser.
					exclude: ["src/tests/unit/**/server/**", "src/modules/*/tests/unit/**/server/**"],
					setupFiles: [
						"./src/tests/unit/temporal-setup.ts",
						"./src/tests/unit/vitest-setup-client.ts",
					],
				},
			},

			{
				extends: "./vite.config.ts",
				test: {
					name: "server-shared",
					...serverSpecs,
					exclude: [...serverSpecs.exclude, ...isolatedServerSpecs, ...harnessServerSpecs],
					// The files share their worker's modules, evaluated once, instead of each importing
					// them anew: about a third off these files' run.
					isolate: false,
					// Undoes a file's `vi.stubGlobal()` and `vi.stubEnv()`, which would otherwise outlive it
					// into the next file of its worker.
					unstubGlobals: true,
					unstubEnvs: true,
				},
			},

			{
				extends: "./vite.config.ts",
				test: { name: "server-isolated", ...serverSpecs, include: isolatedServerSpecs },
			},

			{
				extends: "./vite.config.ts",
				test: {
					name: "server-harness",
					...serverSpecs,
					include: harnessServerSpecs,
					// The seeded demo database, made once per run, and a copy of it for each file.
					globalSetup: ["src/tests/unit/lib/server/harness/global-setup.ts"],
					setupFiles: [...serverSpecs.setupFiles, "./src/tests/unit/lib/server/harness/setup.ts"],
					// A file's first call imports the app's server code and its remote functions: fast
					// alone, but past Vitest's 5 s beside the whole suite.
					testTimeout: 20_000,
				},
			},

			{
				// End-to-end: drives the app in a browser, against servers with fresh, seeded databases
				// (see src/tests/e2e/global-setup.ts).
				test: {
					name: "e2e",
					environment: "node",
					include: ["src/tests/e2e/**/*.test.ts", "src/modules/*/tests/e2e/**/*.test.ts"],
					// Skipped unless asked for (`REPRO_SKELETONS=1`), so not even collected otherwise.
					exclude: [
						"**/node_modules/**",
						...(process.env.REPRO_SKELETONS ? [] : ["src/tests/e2e/skeletons.repro.test.ts"]),
					],
					globalSetup: ["src/tests/e2e/global-setup.ts"],
					setupFiles: ["./src/tests/clock/register.ts", "./src/tests/unit/temporal-setup.ts"],
					// One app and database per worker. `E2E_DEV=1` has a single dev server, which the
					// files share, so they take turns.
					maxWorkers: "60%",
					// After the unit and component tests (and needed for its own `maxWorkers`).
					sequence: { groupOrder: 1 },
					fileParallelism: !process.env.E2E_DEV,
					testTimeout: 30_000,
					hookTimeout: 60_000,
					// Polls wait up to 10 s, not Vitest's 1 s: a server-side table's debounced search or
					// filter, answered under the load of a full run, can take longer than that.
					expect: { requireAssertions: true, poll: { timeout: 10_000 } },
				},
			},
		],
	},
});
