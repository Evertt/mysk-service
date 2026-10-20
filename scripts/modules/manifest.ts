import type { ESTree } from "vite-plus";

import { parseProgram, propertiesOf, stringOf } from "./shared.ts";

/** What the generator reads from `module.ts`. */
export interface Manifest {
	/** The `id:` it states, if it states one as a string, to check against the folder. */
	declaredId?: string;
	/** Whether it has a `portal:` entry (its label and icon in the portal's navigation). */
	declaresPortal?: boolean;
	/** The keys that name a page of the module's (`route:`, `settings:`), which `routes/` has instead. */
	declaredPages?: string[];
	/** The ids in `requires`: modules that must be on for this one to be. */
	requires: string[];
	/** The ids in `enhances`: modules this one adds to when they're on, but doesn't need. */
	enhances: string[];
	/** Whether it says `alwaysOn: true`. */
	alwaysOn: boolean;
	/** The sidebar entry (a core one or a module) its own goes after: `nav: { after }`. */
	navAfter: string | null;
	/** What the generator can't read: a key whose value isn't a literal. */
	problems: string[];
}

/** The ids in `node`, if it's a list of string literals. */
function literalList(node: ESTree.Expression) {
	const ids = node.type === "ArrayExpression" ? node.elements.map((id) => stringOf(id)) : [];
	return node.type === "ArrayExpression" && ids.every((id) => id !== undefined) ? ids : undefined;
}

/**
 * The keys of the manifest in `source`: the object `defineModule()` is called with (in the default
 * export or a statement of its own), or the default export's object.
 */
function manifestObject(source: string) {
	for (const statement of parseProgram("module.ts", source).body) {
		const expression =
			statement.type === "ExportDefaultDeclaration"
				? statement.declaration
				: statement.type === "ExpressionStatement"
					? statement.expression
					: undefined;
		const keys = propertiesOf(
			expression?.type === "CallExpression" ? expression.arguments[0] : expression,
		);
		if (keys) return keys;
	}
}

/**
 * Reads the keys of the `defineModule({ … })` call in a `module.ts` from its syntax (the generator
 * can't import the manifest: it imports components and messages). So `id`, `requires`, `enhances`,
 * `alwaysOn` and `nav` must be literals there.
 */
export function readManifest(source: string): Manifest {
	const problems: string[] = [];
	let keys = new Map<string, ESTree.Expression>();
	try {
		keys = manifestObject(source) ?? keys;
	} catch (error) {
		problems.push((error as Error).message);
	}
	/** The value of `key` as `read` reads it; `problem` when it's there but can't be read. */
	const read = <T>(
		key: string,
		empty: T,
		value: (node: ESTree.Expression) => T | undefined,
		problem: string,
	) => {
		const node = keys.get(key);
		const result = node && value(node);
		if (node && result === undefined) problems.push(problem);
		return result ?? empty;
	};
	const literals = "must be a list of string literals";
	return {
		declaredId: stringOf(keys.get("id")),
		declaresPortal: keys.has("portal"),
		declaredPages: ["route", "settings"].filter((key) => keys.has(key)),
		requires: read("requires", [], literalList, `requires ${literals}`),
		enhances: read("enhances", [], literalList, `enhances ${literals}`),
		alwaysOn: read(
			"alwaysOn",
			false,
			(node) => (node.type === "Literal" && node.value === true) || undefined,
			"alwaysOn must be true or left out",
		),
		navAfter: read(
			"nav",
			null,
			(node) => stringOf(propertiesOf(node)?.get("after")),
			'nav must be { after: "<id>" } with a string literal',
		),
		problems,
	};
}
