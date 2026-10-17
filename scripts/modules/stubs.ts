import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import {
	type RouteExports,
	modulesGroupOf,
	pageOptions,
	routeExports,
	routeFileKind,
	routePlace,
	isIntegrationRoute,
	serverFileKind,
} from "./routes.ts";
import { GENERATED, type ModuleFolder } from "./shared.ts";

const generatedBy = (from: string) => `${GENERATED} from ${from}. Don't edit.`;

/** A name for an import in a stub: `load` → `moduleLoad`. */
const moduleName = (name: string) => `module${name[0].toUpperCase()}${name.slice(1)}`;

const guards = `#lib/server/modules/hooks.ts`;
const routeGuard = `#lib/modules/route-guard.ts`;

/** The exports of a server file that answer a request, which its stub guards; by the file's kind. */
const handlers = {
	page: /^(?:load|actions)$/,
	layout: /^load$/,
	endpoint: /^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|fallback)$/,
	integration: /^(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|fallback)$/,
};

/**
 * A stub for a `+page.ts`, `+server.ts`, … that gives Kit the module's exports under the same
 * names: page options that are literals are repeated (Kit then needs no more than the stub to know
 * them), the rest is re-exported. With `guard`, it's a server file (`+page.server.ts`,
 * `+layout.server.ts`, `+server.ts`) of that module: its `load`, `actions` and request handlers
 * refuse the tenants without the module before they run: the `(modules)` group's guard is a
 * universal load, which doesn't run before them (and Kit runs server loads, form actions and
 * endpoints without waiting for layouts anyway). An `integration` endpoint (in the module's
 * `(api)` routes) takes a token instead of a session, and refuses requests without a valid one
 * (`guardedIntegration()`).
 */
export function renderScriptStub(options: {
	/** The module's file, for the header. */
	from: string;
	/** How the stub imports it. */
	importPath: string;
	exports: RouteExports;
	/** The id of the module to guard for, and which server file this is. */
	guard?: { id: string; kind: "page" | "layout" | "endpoint" | "integration" };
}): string {
	const { from, importPath, exports, guard } = options;
	const { names, literals } = exports;
	const guarded = guard ? names.filter((name) => handlers[guard.kind].test(name)) : [];
	const viaConst = names.filter(
		(name) => pageOptions.has(name) && !(name in literals) && !guarded.includes(name),
	);
	const reexported = names.filter((name) => !pageOptions.has(name) && !guarded.includes(name));

	/** The `./$types` type of what a guarded export takes: the event, or all of the actions. */
	const typeOf = (name: string) =>
		name === "actions"
			? "Actions"
			: name === "load"
				? `${guard!.kind === "page" ? "Page" : "Layout"}ServerLoadEvent`
				: "RequestEvent";

	const handlerGuard = guard?.kind === "integration" ? "guardedIntegration" : "guarded";
	const head: string[] = [];
	const body: string[] = [];
	if (guarded.length) {
		const types = [...new Set(guarded.map(typeOf))];
		const helpers = [
			...(guarded.some((name) => name !== "actions") ? [handlerGuard] : []),
			...(guarded.includes("actions") ? ["guardedActions"] : []),
		];
		head.push(`import type { ${types.join(", ")} } from "./$types";`, "");
		head.push(`import { ${helpers.join(", ")} } from "${guards}";`);
	}
	const imported = [...viaConst, ...guarded];
	if (imported.length) {
		const specifiers = imported.map((name) => `${name} as ${moduleName(name)}`).join(", ");
		head.push(`import { ${specifiers} } from "${importPath}";`);
	}

	for (const [name, text] of Object.entries(literals)) body.push(`export const ${name} = ${text};`);
	for (const name of viaConst) body.push(`export const ${name} = ${moduleName(name)};`);
	for (const name of guarded) {
		const id = JSON.stringify(guard!.id);
		const own = moduleName(name);
		// The route's types check whatever the module's functions take of the event.
		body.push(
			name === "actions"
				? `export const actions = guardedActions(${id}, ${own} satisfies Actions);`
				: `export const ${name} = ${handlerGuard}<${typeOf(name)}, ReturnType<typeof ${own}>>(${id}, ${own});`,
		);
	}
	if (reexported.length) body.push(`export { ${reexported.join(", ")} } from "${importPath}";`);
	return [`// ${generatedBy(from)}`, ...(head.length ? ["", ...head] : []), "", ...body, ""].join(
		"\n",
	);
}

/**
 * The `+layout.ts` of a `(modules)` group: refuses the tenants without the module that owns the
 * route (the folder in the group, which is the module's id), so they get the app's own 404 page
 * inside the group's layouts. A universal load, so that client-side navigations to a module's page
 * don't ask the server for its data (see `#lib/modules/route-guard.ts`).
 */
export function renderGroupGuard(): string {
	return [
		`// ${generatedBy("the modules' routes")}`,
		"",
		`import type { LayoutLoadEvent } from "./$types";`,
		"",
		`import { guardModuleRoute } from "${routeGuard}";`,
		"",
		`export const load = async ({ route }: LayoutLoadEvent) => {`,
		`\tawait guardModuleRoute(route.id);`,
		`};`,
		"",
	].join("\n");
}

/**
 * A stub for a `+page.svelte`, `+layout.svelte` or `+error.svelte`: it passes its props on. A layout
 * renders its `children` inside the module's layout itself, because Kit warns about a layout that
 * doesn't (it looks for the `{@render}` in the source).
 */
export function renderComponentStub(options: {
	from: string;
	importPath: string;
	kind: "page" | "layout" | "error";
}): string {
	const { from, importPath, kind } = options;
	const props = { page: "PageProps", layout: "LayoutProps", error: undefined }[kind];
	return [
		`<!-- ${generatedBy(from)} -->`,
		`<script lang="ts">`,
		...(props ? [`\timport type { ${props} } from "./$types";`, ""] : []),
		`\timport Route from "${importPath}";`,
		...(kind === "layout" ? ["", `\tlet { children, ...props }: LayoutProps = $props();`] : []),
		...(kind === "page" ? ["", `\tlet props: PageProps = $props();`] : []),
		`</script>`,
		"",
		kind === "layout"
			? `<Route {...props}>{@render children()}</Route>`
			: props
				? `<Route {...props} />`
				: `<Route />`,
		"",
	].join("\n");
}

/**
 * The stubs for the modules' routes, per `(modules)` group under `src/routes` (e.g. `(app)/(modules)`):
 * the files in it, relative to it, with their content. The contracts module's
 * `routes/(app)/[number]/+page.svelte` is `contracts/[number]/+page.svelte` in `(app)/(modules)`,
 * whose `+layout.ts` guards the routes of every module in it.
 */
export function planStubs(root: string, modules: ModuleFolder[]): Map<string, Map<string, string>> {
	const groups = new Map<string, Map<string, string>>();
	for (const module of modules) {
		for (const file of module.routeFiles) {
			const place = routePlace(file);
			const kind = routeFileKind(posix.basename(file));
			// `checkModules()` refuses these.
			if (!place || !kind) continue;

			const from = `src/modules/${module.id}/routes/${file}`;
			// By alias, not relatively: the same specifier whatever the stub's depth, and it names the
			// module (`#modules/…` is for what the generator writes, see `src/tests/unit/modules/boundaries.spec.ts`).
			const importPath = `#modules/${module.id}/routes/${file}`;
			const server = serverFileKind(posix.basename(file));
			const stub =
				kind === "script"
					? renderScriptStub({
							from,
							importPath,
							exports: routeExports(from, readFileSync(join(root, from), "utf8")),
							guard: server
								? {
										id: module.id,
										kind:
											server === "endpoint" && isIntegrationRoute(file) ? "integration" : server,
									}
								: undefined,
						})
					: renderComponentStub({ from, importPath, kind });

			const group = modulesGroupOf(place);
			const files = groups.get(group) ?? new Map([["+layout.ts", renderGroupGuard()]]);
			groups.set(group, files);
			files.set(`${module.id}/${place.rest}`, stub);
		}
	}
	return groups;
}
