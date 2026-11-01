/**
 * A remark plugin for mdsvex (`wikiMdsvex` in `scripts/wiki-pages.ts`) that gives a wiki page's `##`
 * headings an `id`, GitHub's anchor for the heading (`headingSlug()`; a repeated one numbered,
 * `notes-1`), and lists them in the page's front-matter, as `headings` (`{ text, id }`). The
 * registry's virtual module (`virtual:wiki-pages`) reads them from there, so the wiki's search
 * (`src/wiki/search.ts`) finds the headings and links to them without shipping the pages' Markdown
 * to the browser. Runs after mdsvex has parsed the front-matter; the headings are listed only
 * where a page has some.
 */
import { headingSlug } from "../src/wiki/parts/github.ts";

/** The little of a Markdown syntax tree (mdast) the plugin reads and writes. */
interface MarkdownNode {
	type: string;
	depth?: number;
	value?: string;
	children?: MarkdownNode[];
	data?: { hProperties?: Record<string, unknown> };
}

/** A heading's text as it reads: its text and inline code, without the Markdown around them. */
function textOf(node: MarkdownNode): string {
	if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
	return (node.children ?? []).map(textOf).join("");
}

export function wikiHeadings() {
	return (tree: MarkdownNode, file: { data: { fm?: Record<string, unknown> } }) => {
		const used = new Map<string, number>();
		const headings: { text: string; id: string }[] = [];
		for (const node of tree.children ?? []) {
			if (node.type !== "heading" || node.depth !== 2) continue;
			const text = textOf(node).trim();
			if (!text) continue;
			const slug = headingSlug(text);
			const seen = used.get(slug) ?? 0;
			used.set(slug, seen + 1);
			const id = seen === 0 ? slug : `${slug}-${seen}`;
			node.data = { ...node.data, hProperties: { ...node.data?.hProperties, id } };
			headings.push({ text, id });
		}
		if (file.data.fm) file.data.fm.headings = headings;
	};
}
