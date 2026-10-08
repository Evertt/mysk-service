import { parseSync } from "vite-plus";

export type RouteFileKind = "page" | "layout" | "error" | "script";

/** What kind of route file `name` is (`+page.svelte`, `+layout.server.ts`, …), if it is one. */
export function routeFileKind(name: string): RouteFileKind | undefined {
	const component = /^\+(page|layout|error)(?:@[^.]*)?\.svelte$/.exec(name);
	if (component) return component[1] as RouteFileKind;
	if (/^\+(?:(?:page|layout)(?:\.server)?|server)\.[jt]s$/.test(name)) return "script";
}

/**
 * Splits a route file's path (relative to `routes/`) into its top-level route folder, which
 * includes the groups in front of it (`(app)/contracts`), and the rest (`[number]/+page.svelte`).
 * Files that sit in a group or at the root have none.
 */
export function topFolder(file: string): { folder: string; rest: string } | undefined {
	const parts = file.split("/");
	const groups = parts.findIndex((part) => !/^\(.*\)$/.test(part));
	// The file itself is the first part that's not a group: it has no folder.
	if (groups === -1 || groups === parts.length - 1) return undefined;
	return {
		folder: parts.slice(0, groups + 1).join("/"),
		rest: parts.slice(groups + 1).join("/"),
	};
}

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
