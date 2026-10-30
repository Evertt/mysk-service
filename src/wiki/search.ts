/**
 * The wiki's search, in its header (`search.svelte`): an index of every page's title and each of
 * its `##` headings, made at build time from the pages' front-matter (the build adds the headings
 * and their ids, `scripts/wiki-headings.ts`), and `searchPages()`, which finds the entries holding
 * every word of a query. Small enough to search in the browser as the visitor types, with no
 * request.
 */
import { pageHref, wikiPages, type WikiPage } from "./pages.ts";

/** A page (`heading` absent) or one of its `##` headings, and the heading's `id` in the page. */
export interface SearchEntry {
	slug: string;
	title: string;
	heading?: string;
	id?: string;
}

/** The entries of these pages: each page's title, then its headings, in the pages' order. */
function indexOf(pages: readonly WikiPage[]): SearchEntry[] {
	return pages.flatMap(({ slug, title, headings }) => [
		{ slug, title },
		...headings.map(({ text, id }) => ({ slug, title, heading: text, id })),
	]);
}

export const searchIndex: readonly SearchEntry[] = indexOf(wikiPages);

/** Where an entry leads: its page, or the heading on it. */
export const entryHref = ({ slug, id }: SearchEntry) => `${pageHref(slug)}${id ? `#${id}` : ""}`;

/**
 * Text as the search compares it: lower case, with curly quotes straight. The build curls the
 * quotes in a page's headings (`it’s`), which a visitor types straight (`it's`), or the other way
 * round on a phone.
 */
const searchable = (text: string) =>
	text
		.toLowerCase()
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"');

/**
 * The entries of `index` that hold every word of `query` (ignoring case and the curl of a quote,
 * and a word as it's being typed: `lis` finds "Lists"), pages whose title holds them all first,
 * then headings, each in the index's order. A heading counts its page's title as well, but is left
 * out where the title alone matches: the page's own entry already leads there. No words, no
 * entries.
 */
export function searchPages(query: string, index: readonly SearchEntry[]): SearchEntry[] {
	const words = searchable(query).split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];
	const holdsAll = (text: string) => words.every((word) => text.includes(word));

	const titles: SearchEntry[] = [];
	const headings: SearchEntry[] = [];
	for (const entry of index) {
		const title = searchable(entry.title);
		if (entry.heading === undefined) {
			if (holdsAll(title)) titles.push(entry);
		} else if (!holdsAll(title) && holdsAll(`${title} ${searchable(entry.heading)}`)) {
			headings.push(entry);
		}
	}
	return [...titles, ...headings];
}
