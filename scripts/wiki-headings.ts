/**
 * A remark plugin for mdsvex (`vite.config.ts`) that adds a wiki page's `##` headings to its
 * front-matter, as `headings`, so the page's `metadata` holds them. The wiki's search
 * (`src/wiki/search.ts`) indexes them, at build time, without shipping the pages' Markdown to the
 * browser. Runs after mdsvex has parsed the front-matter, and only where a page has some.
 */

/** The little of a Markdown syntax tree (mdast) the plugin reads. */
interface MarkdownNode {
	type: string;
	depth?: number;
	value?: string;
	children?: MarkdownNode[];
}

/** A heading's text as it reads: its text and inline code, without the Markdown around them. */
function textOf(node: MarkdownNode): string {
	if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
	return (node.children ?? []).map(textOf).join("");
}

export function wikiHeadings() {
	return (tree: MarkdownNode, file: { data: { fm?: Record<string, unknown> } }) => {
		if (!file.data.fm) return;
		file.data.fm.headings = (tree.children ?? [])
			.filter((node) => node.type === "heading" && node.depth === 2)
			.map((node) => textOf(node).trim())
			.filter(Boolean);
	};
}
