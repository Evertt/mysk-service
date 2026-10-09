import { readFileSync } from "node:fs";
import { join, posix } from "node:path";

import {
	type RouteExports,
	pageOptions,
	routeExports,
	routeFileKind,
	topFolder,
} from "./routes.ts";
import { GENERATED, type ModuleFolder } from "./shared.ts";

const generatedBy = (from: string) => `${GENERATED} from ${from}. Don't edit.`;

/** A name for an import in a stub: `load` → `moduleLoad`. */
const moduleName = (name: string) => `module${name[0].toUpperCase()}${name.slice(1)}`;

/**
 * A stub for a `+page.ts`, `+server.ts`, … that gives Kit the module's exports under the same
 * names: page options that are literals are repeated (Kit then needs no more than the stub to know
 * them), the rest is re-exported. With `guard`, it's the `+layout.server.ts` of a module's route
 * root: it refuses the tenants without the module, then runs the module's `load` if it has one.
 */
export function renderScriptStub(options: {
	/** The module's file, for the header. */
	from: string;
	/** How the stub imports it. */
	importPath: string;
	exports: RouteExports;
	/** The id of the module to guard for. */
	guard?: string;
}): string {
	const { from, importPath, exports, guard } = options;
	const { names, literals } = exports;
	const viaConst = names.filter(
		(name) => pageOptions.has(name) && !(name in literals) && !(guard && name === "load"),
	);
	const reexported = names.filter((name) => !pageOptions.has(name));
	const hasLoad = names.includes("load");

	const head: string[] = [];
	const body: string[] = [];
	if (guard) {
		head.push(`import type { LayoutServerLoadEvent } from "./$types";`, "");
		head.push(`import { guardModule } from "#lib/server/modules.ts";`);
	}
	const imported = [...viaConst, ...(guard && hasLoad ? ["load"] : [])];
	if (imported.length) {
		const specifiers = imported.map((name) => `${name} as ${moduleName(name)}`).join(", ");
		head.push(`import { ${specifiers} } from "${importPath}";`);
	}

	for (const [name, text] of Object.entries(literals)) body.push(`export const ${name} = ${text};`);
	for (const name of viaConst) body.push(`export const ${name} = ${moduleName(name)};`);
	if (reexported.length) body.push(`export { ${reexported.join(", ")} } from "${importPath}";`);
	if (guard) {
		const call = `guardModule(${JSON.stringify(guard)});`;
		body.push(
			hasLoad
				? `export const load = async (event: LayoutServerLoadEvent) => {\n\t${call}\n\t// Whatever the module's load takes of the event is checked here; one that takes none is fine.\n\tconst run: (event: LayoutServerLoadEvent) => ReturnType<typeof moduleLoad> = moduleLoad;\n\treturn run(event);\n};`
				: `export const load = () => {\n\t${call}\n};`,
		);
	}
	return [`// ${generatedBy(from)}`, ...(head.length ? ["", ...head] : []), "", ...body, ""].join(
		"\n",
	);
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

const gitignore = `# ${GENERATED}, and deleted by it when the module goes. Don't edit.\n*\n`;

/**
 * The stubs for the modules' routes, per top-level route folder under `src/routes` (e.g.
 * `(app)/contracts`): the files in it, relative to it, with their content.
 */
export function planStubs(root: string, modules: ModuleFolder[]): Map<string, Map<string, string>> {
	const folders = new Map<string, Map<string, string>>();
	for (const module of modules) {
		const files = module.routeFiles.flatMap((file) => {
			const split = topFolder(file);
			return split ? [{ file, name: posix.basename(file), ...split }] : [];
		});
		/** The route folders with a page, which get the guard (unless the module has its own). */
		const withPages = new Set(
			files.filter(({ name }) => routeFileKind(name) === "page").map(({ folder }) => folder),
		);
		const ownGuards = new Set(
			files
				.filter(({ rest }) => /^\+layout\.server\.[jt]s$/.test(rest))
				.map(({ folder }) => folder),
		);

		for (const { file, name, folder, rest } of files) {
			const kind = routeFileKind(name)!;
			const from = `src/modules/${module.id}/routes/${file}`;
			// By alias, not relatively: the same specifier whatever the stub's depth, and it names the
			// module (`#modules/…` is for what the generator writes, see `src/modules/boundaries.spec.ts`).
			const importPath = `#modules/${module.id}/routes/${file}`;
			const stub =
				kind === "script"
					? renderScriptStub({
							from,
							importPath,
							exports: routeExports(from, readFileSync(join(root, from), "utf8")),
							guard: /^\+layout\.server\.[jt]s$/.test(rest) ? module.id : undefined,
						})
					: renderComponentStub({ from, importPath, kind });
			const stubs = folders.get(folder) ?? new Map([[".gitignore", gitignore]]);
			folders.set(folder, stubs.set(rest, stub));
		}
		for (const folder of withPages) {
			if (ownGuards.has(folder)) continue;
			folders.get(folder)!.set(
				"+layout.server.ts",
				renderScriptStub({
					from: `the ${module.id} module`,
					importPath: "",
					exports: { names: [], literals: {} },
					guard: module.id,
				}),
			);
		}
	}
	return folders;
}
