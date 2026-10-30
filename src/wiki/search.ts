/**
 * The wiki's search, in its header (`search.svelte`): an index of every page's title and each of
 * its `##` headings, made at build time from the pages' front-matter (the build adds the headings,
 * `scripts/wiki-headings.ts`), and `searchPages()`, which finds the entries holding every word of
 * a query. Small enough to search in the browser as the visitor types, with no request.
 */
import { wikiPages, type WikiPage } from "./pages.ts";

/** A page (`heading` absent) or one of its `##` headings. */
export interface SearchEntry {
	slug: string;
	title: string;
	heading?: string;
}

/** The entries of these pages: each page's title, then its headings, in the pages' order. */
function indexOf(pages: readonly WikiPage[]): SearchEntry[] {
	return pages.flatMap(({ slug, title, headings }) => [
		{ slug, title },
		...headings.map((heading) => ({ slug, title, heading })),
	]);
}

export const searchIndex: readonly SearchEntry[] = indexOf(wikiPages);

/**
 * The entries of `index` that hold every word of `query` (ignoring case, and a word as it's being
 * typed: `lis` finds "Lists"), pages whose title holds them all first, then headings, each in the
 * index's order. A heading counts its page's title as well, but is left out where the title alone
 * matches: the page's own entry already leads there. No words, no entries.
 */
export function searchPages(query: string, index: readonly SearchEntry[]): SearchEntry[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const holdsAll = (text: string) => words.every((word) => text.includes(word));

	const titles: SearchEntry[] = [];
	const headings: SearchEntry[] = [];
	for (const entry of index) {
		const title = entry.title.toLowerCase();
		if (entry.heading === undefined) {
			if (holdsAll(title)) titles.push(entry);
		} else if (!holdsAll(title) && holdsAll(`${title} ${entry.heading.toLowerCase()}`)) {
			headings.push(entry);
		}
	}
	return [...titles, ...headings];
}
