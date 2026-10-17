import { parseSync } from "vite-plus";

export type RouteFileKind = "page" | "layout" | "error" | "script";

/** What kind of route file `name` is (`+page.svelte`, `+layout.server.ts`, …), if it is one. */
export function routeFileKind(name: string): RouteFileKind | undefined {
	const component = /^\+(page|layout|error)(?:@[^.]*)?\.svelte$/.exec(name);
	if (component) return component[1] as RouteFileKind;
	if (/^\+(?:(?:page|layout)(?:\.server)?|server)\.[jt]s$/.test(name)) return "script";
}

/**
 * Which server file `name` is: a page's or a layout's `+….server.ts`, or an endpoint's `+server.ts`.
 * Their stubs guard themselves, because SvelteKit runs them without waiting for the layouts above
 * (form actions and endpoints don't run those at all).
 */
export function serverFileKind(name: string): "page" | "layout" | "endpoint" | undefined {
	const match = /^\+(?:(page|layout)\.server|server)\.[jt]s$/.exec(name);
	if (match) return (match[1] as "page" | "layout" | undefined) ?? "endpoint";
}

/** The route group in `src/routes` that holds the modules' stubs: the generator's, never the core's. */
export const MODULES_GROUP = "(modules)";

/**
 * The leading route group of a module's integration endpoints (`routes/(api)/ingest/+server.ts`
 * is `/<id>/ingest`): requests from systems outside the app, with a token of the module's instead
 * of a session (`guardedIntegration()` in `#lib/server/modules/hooks.ts`). It holds `+server.ts`
 * files only, and `hooks.server.ts` lets requests to its routes through without signing in.
 */
export const API_GROUP = "(api)";

/** Whether a route file is in the integration group: its first segment is `(api)`. */
export const isIntegrationRoute = (file: string) => file.split("/")[0] === API_GROUP;

export const isGroup = (segment: string) => /^\(.*\)$/.test(segment);

/**
 * Where a module's route file sits. A module's `routes/` holds route groups only (`(app)`); what's
 * in them goes in the module's own route folder, which is its id (implied, never written):
 * `routes/(app)/[number]/+page.svelte` is `(app)/(modules)/<id>/[number]/+page.svelte`.
 */
export interface RoutePlace {
	/** The groups in front of the module's folder (`(app)`), whose layouts it gets: at least one. */
	groups: string[];
	/** The path inside the module's folder (`[number]/+page.svelte`, or just `+page.svelte`). */
	rest: string;
}

/**
 * Splits a route file's path (relative to `routes/`) into its leading groups (all the leading
 * segments in parentheses) and the rest: `(app)/[number]/+page.svelte` → `(app)`,
 * `[number]/+page.svelte`. A file directly in `routes/`, or in a top-level folder that isn't a
 * group, has no place.
 */
export function routePlace(file: string): RoutePlace | undefined {
	const parts = file.split("/");
	// The file's own name is never a group, so some part isn't one.
	const index = parts.findIndex((part) => !isGroup(part));
	if (index < 1) return undefined;
	return { groups: parts.slice(0, index), rest: parts.slice(index).join("/") };
}

/**
 * The `(modules)` group, relative to `src/routes`, that a module's route file is linked into: the
 * one inside its groups (`(app)/(modules)`), so the route keeps their layouts.
 */
export const modulesGroupOf = (place: RoutePlace) => [...place.groups, MODULES_GROUP].join("/");

/** The page options SvelteKit reads from a route file (and `load`), see `statically_analyse_page_options`. */
export const pageOptions = new Set([
	"ssr",
	"csr",
	"prerender",
	"trailingSlash",
	"config",
	"entries",
	"load",
]);

/** What a route script exports. */
export interface RouteExports {
	/** The names of its value exports (no types). */
	names: string[];
	/** The page options it declares as literals, e.g. `{ ssr: "false" }`: name → source text. */
	literals: Record<string, string>;
}

/** The exports of a `+page.ts`, `+server.ts`, …; throws on forms the stubs can't repeat. */
export function routeExports(file: string, source: string): RouteExports {
	const { program, errors } = parseSync(file, source, { sourceType: "module" });
	if (errors.length) throw new Error(`${file}: ${errors[0].message}`);
	const names: string[] = [];
	const literals: Record<string, string> = {};
	const nameOf = (node: { type: string; name?: string; value?: unknown }) =>
		String(node.type === "Identifier" ? node.name : node.value);

	for (const statement of program.body) {
		if (statement.type === "ExportDefaultDeclaration") {
			throw new Error(`${file}: a route file can't have a default export.`);
		}
		if (statement.type === "ExportAllDeclaration") {
			throw new Error(
				`${file}: \`export * from\` hides the exports from SvelteKit's analysis: name them.`,
			);
		}
		if (statement.type !== "ExportNamedDeclaration" || statement.exportKind === "type") continue;

		const { declaration } = statement;
		if (declaration?.type === "VariableDeclaration") {
			for (const declarator of declaration.declarations) {
				if (declarator.id.type !== "Identifier") {
					throw new Error(`${file}: export names one at a time, not by destructuring.`);
				}
				const name = declarator.id.name;
				names.push(name);
				if (declaration.kind === "const" && declarator.init?.type === "Literal") {
					if (pageOptions.has(name)) {
						literals[name] = source.slice(declarator.init.start, declarator.init.end);
					}
				}
			}
		} else if (
			(declaration?.type === "FunctionDeclaration" || declaration?.type === "ClassDeclaration") &&
			declaration.id
		) {
			names.push(declaration.id.name);
		}
		for (const specifier of statement.specifiers) {
			if (specifier.exportKind !== "type") names.push(nameOf(specifier.exported));
		}
	}
	return { names, literals };
}
