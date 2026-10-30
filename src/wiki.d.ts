/**
 * What importing a wiki page (`src/wiki/pages/**\/*.md`, compiled by mdsvex) gives: the page as a
 * component, and its front-matter as `metadata`. mdsvex types only `*.svx` and `*.svelte.md`.
 */
declare module "*.md" {
	export const metadata: Record<string, unknown>;
	const page: import("svelte").Component;
	export default page;
}
