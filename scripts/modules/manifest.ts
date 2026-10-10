/** What `module.ts` says about the module's place among the others. */
export interface ManifestGraph {
	requires: string[];
	enhances: string[];
	alwaysOn: boolean;
	/** The sidebar entry (a core one or a module) its own goes after: `nav: { after }`. */
	navAfter: string | null;
	/** What the generator can't read: a key whose value isn't a literal. */
	problems: string[];
}

const LITERAL = /^(["'`])([^"'`]*)\1$/;

/** The ids in the list the key `key:` opens, if the key is there and its value is `[...]` of literals. */
function literalList(source: string, key: "requires" | "enhances") {
	if (!new RegExp(`\\b${key}:`).test(source)) return { ids: [] };
	const body = new RegExp(`\\b${key}:\\s*\\[([^\\]]*)\\]`).exec(source)?.[1];
	if (body === undefined) return { ids: [], problem: `${key} must be a list of string literals` };
	const items = body
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
	const ids = items.map((item) => LITERAL.exec(item)?.[2]);
	if (ids.some((id) => id === undefined)) {
		return { ids: [], problem: `${key} must be a list of string literals` };
	}
	return { ids: ids as string[] };
}

/** What `nav: { after: "<id>" }` names, if the key is there and its value is that literal. */
function navAfter(source: string) {
	if (!/\bnav:/.test(source)) return { id: null };
	const id = /\bnav:\s*\{\s*after:\s*(["'`])([^"'`]*)\1\s*,?\s*\}/.exec(source)?.[2];
	return id === undefined
		? { id: null, problem: 'nav must be { after: "<id>" } with a string literal' }
		: { id };
}

/**
 * Reads `requires`, `enhances`, `alwaysOn` and `nav` out of a `module.ts` with patterns, like its `id:`
 * (the generator can't import the manifest: it imports components and messages). So they must be
 * literals in the `defineModule()` call.
 */
export function readManifestGraph(source: string): ManifestGraph {
	const problems: string[] = [];
	const requires = literalList(source, "requires");
	const enhances = literalList(source, "enhances");
	for (const list of [requires, enhances]) if (list.problem) problems.push(list.problem);

	let alwaysOn = false;
	if (/\balwaysOn:/.test(source)) {
		if (/\balwaysOn:\s*true\b/.test(source)) alwaysOn = true;
		else problems.push("alwaysOn must be true or left out");
	}
	const nav = navAfter(source);
	if (nav.problem) problems.push(nav.problem);
	return { requires: requires.ids, enhances: enhances.ids, alwaysOn, navAfter: nav.id, problems };
}
