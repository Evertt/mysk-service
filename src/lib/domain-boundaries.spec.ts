/**
 * Keeps the core domains (`src/lib/{orders,customers,equipment,engineers,materials}`) behind their
 * barrels (see "Where files go" in AGENTS.md):
 *
 * - code outside a domain imports it only through its barrels (`#lib/<d>/index.ts`, `components.ts`,
 *   `remotes.ts` and `server/index.ts`), except `extensions.ts` (the module generator and the
 *   modules' module-scope contributions need that file itself) and `e2e/` and `scripts/` (no Vite
 *   plugins: they import plain files by path);
 * - code inside a domain imports its siblings relatively, never its own barrels (a cycle);
 * - the barrels hold what their names say (no component in the main barrel, no `server/` file
 *   outside the server one, ...);
 * - code that runs when a module is evaluated never reads an import from another domain (a cycle
 *   between two barrels is harmless only if nothing is read while they evaluate);
 * - the routes of a migrated domain hold route files only (names starting with `+`).
 *
 * The checks also run on made-up files, to show they find what they should.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix, relative } from "node:path";

import { parseSync } from "vite-plus";
import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../..");

interface SourceFile {
	/** Relative to the project root, with `/`. */
	path: string;
	source: string;
}

export const domains = ["customers", "engineers", "equipment", "materials", "orders"];

/**
 * The domains whose files have left `src/routes`, and the modules whose files have left their
 * `routes/`. Until then their route folders still hold the files that are about to move, and those
 * may use the old imports.
 */
export const migratedDomains: string[] = ["engineers"];
export const migratedModules: string[] = [];

const barrelNames = ["index.ts", "components.ts", "remotes.ts", "server/index.ts"];
const isBarrel = (path: string) =>
	domains.some((d) => barrelNames.some((name) => path === `src/lib/${d}/${name}`));
const domainOf = (path: string) => /^src\/lib\/([^/]+)\//.exec(path)?.[1];
const ownDomain = (path: string) => {
	const d = domainOf(path);
	return d && domains.includes(d) ? d : undefined;
};

/** Where a specifier written in the file at `path` points, from the project root. */
export function target(specifier: string, path: string): string | undefined {
	if (specifier.startsWith(".")) return posix.join(posix.dirname(path), specifier);
	if (specifier.startsWith("#lib/")) return `src/lib/${specifier.slice("#lib/".length)}`;
	return undefined;
}

type ImportKind = "static" | "type" | "dynamic" | "mock";

/** What a source file imports (`import`, `export … from`, `import()`, `vi.mock()`), by kind. */
export function importsOf(source: string): { specifier: string; kind: ImportKind }[] {
	const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
	const found: { specifier: string; kind: ImportKind }[] = [];
	const from = /\b(?:import|export)\s+(type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']/g;
	for (const [, type, specifier] of code.matchAll(from)) {
		found.push({ specifier, kind: type ? "type" : "static" });
	}
	for (const [, specifier] of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
		found.push({ specifier, kind: "dynamic" });
	}
	for (const [, specifier] of code.matchAll(
		/\bvi\.(?:mock|doMock|unmock|importActual)\(\s*["']([^"']+)["']/g,
	)) {
		found.push({ specifier, kind: "mock" });
	}
	return found;
}

/** Imports of a domain from outside it that don't go through its barrels. */
export function outsideImports(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		// Plain Node and the e2e project have no Svelte plugin or SvelteKit: they import files by path.
		if (file.path.startsWith("e2e/") || file.path.startsWith("scripts/")) return [];
		const own = ownDomain(file.path);
		return importsOf(file.source).flatMap(({ specifier, kind }) => {
			const to = target(specifier, file.path);
			const d = to && ownDomain(to);
			if (!to || !d || d === own || kind === "mock") return [];
			if (isBarrel(to) || to === `src/lib/${d}/extensions.ts`) return [];
			// The route folder of a domain that hasn't moved yet.
			const rest = /^src\/routes\/\(app\)\/([^/]+)\//.exec(file.path)?.[1];
			if (rest === d && !migratedDomains.includes(d)) return [];
			return [
				`${file.path} imports ${specifier}: go through #lib/${d}/index.ts, components.ts, remotes.ts or server/index.ts`,
			];
		});
	});
}

/** Imports inside a domain of its own barrels, or by `#lib/<d>/…` instead of relatively. */
export function insideImports(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		const own = ownDomain(file.path);
		if (!own || isBarrel(file.path)) return [];
		return importsOf(file.source).flatMap(({ specifier }) => {
			const to = target(specifier, file.path);
			if (!to || ownDomain(to) !== own) return [];
			if (isBarrel(to))
				return [`${file.path} imports its own barrel ${specifier}: import the file`];
			return specifier.startsWith("#lib/")
				? [`${file.path} imports ${specifier}: inside a domain, import relatively`]
				: [];
		});
	});
}

/** A barrel that holds something its name says it doesn't. */
export function barrelContents(files: SourceFile[]): string[] {
	const rules: [string, (specifier: string) => boolean, string][] = [
		["index.ts", (s) => !/\.svelte$|\.remote\.ts$|(^|\/)server\//.test(s), "plain TS only"],
		["components.ts", (s) => s.endsWith(".svelte"), "components only"],
		["remotes.ts", (s) => s.endsWith(".remote.ts"), "remote functions only"],
		["server/index.ts", (s) => !/\.svelte$|\.remote\.ts$/.test(s), "server files only"],
	];
	return files.flatMap((file) =>
		rules.flatMap(([name, allowed, what]) => {
			if (!domains.some((d) => file.path === `src/lib/${d}/${name}`)) return [];
			return importsOf(file.source).flatMap(({ specifier }) =>
				allowed(specifier) ? [] : [`${file.path} exports ${specifier}: ${what}`],
			);
		}),
	);
}

/** Route folders that still hold a file that isn't a route, for the domains and modules that moved. */
export function routeFolders(paths: string[]): string[] {
	return paths.flatMap((path) => {
		const domain = /^src\/routes\/\(app\)\/([^/]+)\/(.*)$/.exec(path);
		if (domain && migratedDomains.includes(domain[1]) && !/(^|\/)\+[^/]*$/.test(domain[2])) {
			return [`${path} is not a route file: it belongs in src/lib/${domain[1]}/`];
		}
		const module = /^src\/modules\/([^/]+)\/routes\/(.*)$/.exec(path);
		if (module && migratedModules.includes(module[1]) && !/(^|\/)\+[^/]*$/.test(module[2])) {
			return [`${path} is not a route file: it belongs in src/modules/${module[1]}/`];
		}
		return [];
	});
}

// --- Module-scope reads -------------------------------------------------------------------------

interface Node {
	type: string;
	[key: string]: unknown;
}

const isNode = (value: unknown): value is Node =>
	typeof value === "object" && value !== null && typeof (value as Node).type === "string";

/** The script blocks of a file to check: the whole of a `.ts`, only `<script module>` of a `.svelte`. */
function moduleCode(file: SourceFile): string[] {
	if (!file.path.endsWith(".svelte")) return [file.source];
	return [...file.source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
		.filter(([, attributes]) => /\bmodule\b/.test(attributes))
		.map(([, , code]) => code);
}

/** The names that `code` imports from the barrels of domains other than `own` (not types). */
function foreignBindings(program: Node, own: string | undefined): Set<string> {
	const names = new Set<string>();
	for (const statement of program.body as Node[]) {
		if (statement.type !== "ImportDeclaration" || statement.importKind === "type") continue;
		const specifier = (statement.source as Node).value as string;
		const to = target(specifier, "src/lib/x.ts");
		const d = to && ownDomain(to);
		if (!d || d === own || !to || !isBarrel(to)) continue;
		for (const part of statement.specifiers as Node[]) {
			if (part.importKind === "type") continue;
			names.add(((part.local as Node).name as string) ?? "");
		}
	}
	return names;
}

/** References to `names` that run when the module is evaluated: outside function bodies and classes. */
function moduleScopeReferences(program: Node, names: Set<string>): string[] {
	const found = new Set<string>();
	const visit = (node: unknown, parent?: Node, key?: string): void => {
		if (Array.isArray(node)) return node.forEach((item) => visit(item, parent, key));
		if (!isNode(node)) return;
		if (
			node.type === "FunctionDeclaration" ||
			node.type === "FunctionExpression" ||
			node.type === "ArrowFunctionExpression" ||
			node.type === "ImportDeclaration"
		) {
			return;
		}
		if (node.type === "ClassDeclaration" || node.type === "ClassExpression") {
			return visit(node.superClass, node);
		}
		if (node.type.startsWith("TS") && !/^TS(As|NonNull|Satisfies)/.test(node.type)) return;
		if (node.type === "Identifier") {
			const property =
				(parent?.type === "MemberExpression" && key === "property" && !parent.computed) ||
				(parent?.type === "Property" && key === "key" && !parent.computed);
			if (!property && names.has(node.name as string)) found.add(node.name as string);
			return;
		}
		for (const [childKey, child] of Object.entries(node)) {
			if (childKey !== "type") visit(child, node, childKey);
		}
	};
	visit(program.body);
	return [...found];
}

/** Reads of another domain's imports while a module evaluates. */
export function moduleScopeReads(files: SourceFile[]): string[] {
	return files.flatMap((file) => {
		const own = ownDomain(file.path);
		if (!own || /\.(spec|test-harness)\.|\.test-support\./.test(file.path) || isBarrel(file.path)) {
			return [];
		}
		return moduleCode(file).flatMap((code) => {
			const { program } = parseSync(file.path.replace(/\.svelte$/, ".ts"), code, {
				sourceType: "module",
			}) as unknown as { program: Node };
			const names = foreignBindings(program, own);
			return moduleScopeReferences(program, names).map(
				(name) => `${file.path} reads ${name}, imported from another domain, when it is evaluated`,
			);
		});
	});
}

describe("the checks", () => {
	const file = (path: string, source: string): SourceFile => ({ path, source });

	test("find an import of a domain that skips its barrels", () => {
		const files = [
			file(
				"src/routes/(app)/dashboard/x.ts",
				[
					`import { a } from "#lib/orders/display.ts";`,
					`import { b } from "#lib/orders/index.ts";`,
					`import { c } from "#lib/orders/extensions.ts";`,
					`import { d } from "#lib/orders/server/index.ts";`,
					`import F from "../../../lib/orders/ui/order-link.svelte";`,
					`vi.mock("#lib/orders/order.remote.ts");`,
				].join("\n"),
			),
			file("src/lib/customers/x.ts", `import { e } from "#lib/orders/components.ts";`),
			file("src/lib/customers/y.ts", `import { e } from "#lib/orders/ui/order-link.svelte";`),
			file("e2e/a.test.ts", `import { f } from "../src/lib/customers/countries.ts";`),
		];
		expect(outsideImports(files)).toEqual([
			`src/routes/(app)/dashboard/x.ts imports #lib/orders/display.ts: go through #lib/orders/index.ts, components.ts, remotes.ts or server/index.ts`,
			`src/routes/(app)/dashboard/x.ts imports ../../../lib/orders/ui/order-link.svelte: go through #lib/orders/index.ts, components.ts, remotes.ts or server/index.ts`,
			`src/lib/customers/y.ts imports #lib/orders/ui/order-link.svelte: go through #lib/orders/index.ts, components.ts, remotes.ts or server/index.ts`,
		]);
	});

	test("find a domain importing its own barrel, or its own files by alias", () => {
		const files = [
			file(
				"src/lib/orders/list/a.ts",
				`import { x } from "#lib/orders/index.ts";\nimport { y } from "../display.ts";`,
			),
			file("src/lib/orders/list/b.ts", `import { z } from "#lib/orders/display.ts";`),
			file("src/lib/orders/index.ts", `export * from "./display.ts";`),
		];
		expect(insideImports(files)).toEqual([
			"src/lib/orders/list/a.ts imports its own barrel #lib/orders/index.ts: import the file",
			"src/lib/orders/list/b.ts imports #lib/orders/display.ts: inside a domain, import relatively",
		]);
	});

	test("find a barrel that holds what it shouldn't", () => {
		const files = [
			file(
				"src/lib/orders/index.ts",
				`export * from "./display.ts";\nexport { default as A } from "./ui/a.svelte";`,
			),
			file("src/lib/orders/components.ts", `export * from "./display.ts";`),
			file("src/lib/orders/remotes.ts", `export * from "./order.remote.ts";`),
			file(
				"src/lib/orders/server/index.ts",
				`export * from "./pricing.ts";\nexport * from "../order.remote.ts";`,
			),
		];
		expect(barrelContents(files)).toEqual([
			"src/lib/orders/index.ts exports ./ui/a.svelte: plain TS only",
			"src/lib/orders/components.ts exports ./display.ts: components only",
			"src/lib/orders/server/index.ts exports ../order.remote.ts: server files only",
		]);
	});

	test("find a read of another domain's import while a module evaluates", () => {
		const ts = file(
			"src/lib/equipment/list/columns.ts",
			[
				`import { CustomerLink } from "#lib/customers/components.ts";`,
				`import { segments } from "#lib/customers/index.ts";`,
				`import type { Option } from "#lib/customers/index.ts";`,
				`import { own } from "../display.ts";`,
				`export const bad = segments.map((s) => s);`,
				`export const ok = () => segments.map((s) => s);`,
				`export const cell = { render: () => CustomerLink };`,
				`export const key = { segments: 1, [own]: 2 };`,
			].join("\n"),
		);
		const svelte = file(
			"src/lib/equipment/list/t.svelte",
			`<script module lang="ts">\n\timport { segments } from "#lib/customers/index.ts";\n\texport const x = segments;\n</script>\n<script lang="ts">\n\timport { segments } from "#lib/customers/index.ts";\n\tconst y = segments;\n</script>`,
		);
		expect(moduleScopeReads([ts, svelte])).toEqual([
			"src/lib/equipment/list/columns.ts reads segments, imported from another domain, when it is evaluated",
			"src/lib/equipment/list/t.svelte reads segments, imported from another domain, when it is evaluated",
		]);
	});

	test("find a route file's neighbours that aren't route files, once the domain has moved", () => {
		migratedDomains.push("orders");
		try {
			expect(
				routeFolders([
					"src/routes/(app)/orders/+page.svelte",
					"src/routes/(app)/orders/[number]/columns.ts",
					"src/routes/(app)/customers/columns.ts",
				]),
			).toEqual([
				"src/routes/(app)/orders/[number]/columns.ts is not a route file: it belongs in src/lib/orders/",
			]);
		} finally {
			migratedDomains.pop();
		}
	});
});

// --- The project --------------------------------------------------------------------------------

/** The source files of the project that are checked in, leaving out what's generated or installed. */
function sourceFiles(): SourceFile[] {
	const skip = /(?:^|\/)(?:node_modules|\.svelte-kit|paraglide|build)(?:\/|$)/;
	const files: SourceFile[] = [];
	for (const folder of ["src", "e2e", "scripts"]) {
		if (!existsSync(join(root, folder))) continue;
		for (const entry of readdirSync(join(root, folder), { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !/\.(?:ts|js|svelte)$/.test(entry.name)) continue;
			const path = relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/");
			if (skip.test(path) || path.endsWith(".gen.ts")) continue;
			files.push({ path, source: readFileSync(join(root, path), "utf8") });
		}
	}
	return files;
}

describe("the project", () => {
	// Leaving out this file, whose made-up files are in strings.
	const files = sourceFiles().filter((f) => f.path !== "src/lib/domain-boundaries.spec.ts");

	test("imports a domain only through its barrels", () => {
		expect(outsideImports(files)).toEqual([]);
	});

	test("imports inside a domain relatively, never through its own barrel", () => {
		expect(insideImports(files)).toEqual([]);
	});

	test("keeps each barrel to its kind of file", () => {
		expect(barrelContents(files)).toEqual([]);
	});

	test("reads nothing from another domain while a module evaluates", () => {
		expect(moduleScopeReads(files)).toEqual([]);
	});

	test("keeps only route files in the routes of a domain that has moved", () => {
		expect(routeFolders(files.map((f) => f.path))).toEqual([]);
	});
});
