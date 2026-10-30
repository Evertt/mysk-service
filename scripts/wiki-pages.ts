/**
 * The wiki's pages for Vite (`vite.config.ts`): mdsvex's options for them, and `wikiPagesPlugin()`,
 * which serves their front-matter as the virtual module `virtual:wiki-pages`.
 *
 * The registry (`src/wiki/pages.ts`), the sidebar and the search need every page's front-matter,
 * but only one page's body. Importing the pages' `metadata` would bundle every page, and every
 * widget it imports, into the chunk of each wiki page; so this reads the front-matter here, at
 * build time and in dev, and the route imports one page by its slug. It compiles each page as the
 * preprocessor does (`wikiMdsvex`), so `metadata` holds the `headings` the Markdown pass adds
 * (`wiki-headings.ts`). A page without front-matter, or with front-matter that doesn't parse, is
 * `null`, which `buildPages()` refuses, naming the file. In dev a page that comes, goes or changes
 * its front-matter or headings updates the module.
 */
import { globSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import { compile } from "mdsvex";
import type { Plugin } from "vite-plus";

import { wikiHeadings } from "./wiki-headings.ts";

/** mdsvex's options for the wiki's pages: the preprocessor's and `readWikiPages()`'s, so both read a page alike. */
export const wikiMdsvex = { extensions: [".md"], remarkPlugins: [wikiHeadings] };

const virtualId = "virtual:wiki-pages";
const resolvedId = `\0${virtualId}`;

/** What a page's source last compiled to, so an unchanged page isn't compiled again. */
type Cache = Map<string, { source: string; metadata: unknown }>;

async function metadataOf(file: string, cache: Cache) {
	const source = readFileSync(file, "utf8");
	const known = cache.get(file);
	if (known?.source === source) return known.metadata;
	const result = await compile(source, { ...wikiMdsvex, filename: file });
	const metadata = result?.data?.fm ?? null;
	cache.set(file, { source, metadata });
	return metadata;
}

/**
 * The front-matter of every `.md` file under `dir`, by the key `import.meta.glob("./pages/**")`
 * gives it in `src/wiki/pages.ts` (`./pages/orders/lifecycle.md`): `null` where there is none.
 */
export async function readWikiPages(dir: string, cache: Cache = new Map()) {
	const files = globSync("**/*.md", { cwd: dir }).sort();
	const entries = await Promise.all(
		files.map(async (file) => [
			`./pages/${file.split(sep).join("/")}`,
			await metadataOf(join(dir, file), cache),
		]),
	);
	return Object.fromEntries(entries) as Record<string, unknown>;
}

/** Serves `virtual:wiki-pages`: `readWikiPages()` of `src/wiki/pages`, as its default export. */
export function wikiPagesPlugin(root: string): Plugin {
	const dir = resolve(root, "src/wiki/pages");
	const cache: Cache = new Map();
	/** The code each environment (client, ssr) was last served, to tell whether a change matters. */
	const served = new Map<string, string>();
	const code = async () => `export default ${JSON.stringify(await readWikiPages(dir, cache))};`;

	return {
		name: "wiki-pages",
		resolveId(id) {
			if (id === virtualId) return resolvedId;
		},
		async load(id) {
			if (id !== resolvedId) return;
			const text = await code();
			served.set(this.environment.name, text);
			return text;
		},
		// A page added, removed or changed: the module again, where what it holds has changed.
		async hotUpdate({ file, modules }) {
			if (!file.startsWith(dir + sep) || !file.endsWith(".md")) return;
			const graph = this.environment.moduleGraph;
			const module = graph.getModuleById(resolvedId);
			if (!module || served.get(this.environment.name) === (await code())) return;
			graph.invalidateModule(module);
			// Its importer (the registry) too: its `import.meta.glob` of the pages is expanded anew
			// with it, or a page that just came has front-matter but no loader yet, and one that just
			// went the other way round.
			for (const importer of module.importers) graph.invalidateModule(importer);
			return [...modules, module];
		},
	};
}
