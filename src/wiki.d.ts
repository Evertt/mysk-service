/**
 * What importing a wiki page (`src/wiki/pages/**\/*.md`, compiled by mdsvex) gives: the page as a
 * component, and its front-matter as `metadata`. mdsvex types only `*.svx` and `*.svelte.md`.
 */
declare module "*.md" {
	export const metadata: Record<string, unknown>;
	const page: import("svelte").Component;
	export default page;
}

/**
 * The wiki's pages' front-matter, and their twins', by file (`./pages/orders/lifecycle.md`,
 * `./pages/orders/lifecycle.nl.md`), as `scripts/wiki-pages.ts` reads it at build time: `null` for
 * a file without any.
 */
declare module "virtual:wiki-pages" {
	const frontMatter: Record<string, unknown>;
	export default frontMatter;
}
