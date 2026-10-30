/**
 * The wiki's pages. Each file in `./pages` is an mdsvex `.md` page that starts with front-matter,
 * which `buildPages()` checks against the app: the section, and what the page `covers`, which must
 * be a module, core domain, shell or theme that exists. The guards read `covers` to see what the
 * wiki says about each; the route, the sidebar and the search read the rest.
 *
 * The front-matter comes from `virtual:wiki-pages` (`scripts/wiki-pages.ts`), read at build time,
 * not from the pages' modules: so a wiki page's chunk holds that page alone, and the route loads
 * it by its slug (`load`).
 */
import type { Component } from "svelte";
import * as v from "valibot";
import frontMatter from "virtual:wiki-pages";

import { shells, type ShellName } from "#lib/auth/shells.ts";
import { moduleIds, type ModuleId } from "#lib/modules/ids.ts";
import type { NavGroup } from "#lib/modules/nav.ts";
import { themeNames, type ThemeName } from "#lib/themes/index.ts";

import { sectionInfo, wikiSections, type WikiSection } from "./sections.ts";

/** The core domains the wiki covers (`domain:<name>`). */
export const coreDomains = ["orders", "customers", "equipment", "engineers"] as const;

/**
 * What a page says it covers: `module:<id>`, `domain:<name>`, `shell:<name>` or `theme:<name>`.
 */
export type Coverage =
	| `module:${ModuleId}`
	| `domain:${(typeof coreDomains)[number]}`
	| `shell:${ShellName}`
	| `theme:${ThemeName}`;

export interface PageMeta {
	title: string;
	summary: string;
	section: WikiSection;
	order: number;
	status: "built" | "partly built" | "planned";
	covers: Coverage[];
	/**
	 * The page's `##` headings, and the `id` each has in the page, which the build adds to its
	 * front-matter (`scripts/wiki-headings.ts`).
	 */
	headings: { text: string; id: string }[];
}

export interface WikiPage extends PageMeta {
	/** Path under `/wiki`, e.g. `orders/lifecycle`. */
	slug: string;
	load: () => Promise<{ default: Component }>;
}

const shellNames = Object.keys(shells) as ShellName[];

const coverage = v.picklist([
	...moduleIds.map((id) => `module:${id}` as const),
	...coreDomains.map((name) => `domain:${name}` as const),
	...shellNames.map((name) => `shell:${name}` as const),
	...themeNames.map((name) => `theme:${name}` as const),
]);

const pageMeta = v.object({
	title: v.pipe(v.string(), v.nonEmpty()),
	summary: v.pipe(v.string(), v.nonEmpty()),
	section: v.picklist(wikiSections),
	order: v.number(),
	status: v.picklist(["built", "partly built", "planned"]),
	covers: v.array(coverage),
	headings: v.optional(v.array(v.object({ text: v.string(), id: v.string() })), []),
});

/** The path under `/wiki` of the page file `./pages/<slug>.md`. */
const slugOf = (key: string) => key.replace(/^\.\/pages\//, "").replace(/\.md$/, "");

/**
 * The pages of these files (`metadata` as `virtual:wiki-pages` holds it, and `loaders` as
 * `import.meta.glob` makes them, both by file key), sorted by section, then `order`, then title. Throws on the first file whose front-matter
 * is wrong or missing, or that has no loader, naming it and what is wrong.
 */
export function buildPages(
	metadata: Record<string, unknown>,
	loaders: Record<string, () => Promise<{ default: Component }>>,
): WikiPage[] {
	return [...new Set([...Object.keys(metadata), ...Object.keys(loaders)])]
		.map((key): WikiPage => {
			const parsed = v.safeParse(pageMeta, metadata[key]);
			if (!parsed.success) {
				const problems = parsed.issues.map((issue) => {
					const path = v.getDotPath(issue);
					return path ? `${path}: ${issue.message}` : issue.message;
				});
				throw new Error(`Wiki page ${key}: bad front-matter (${problems.join("; ")})`);
			}
			const load = loaders[key];
			if (!load) throw new Error(`Wiki page ${key}: no loader`);
			return { ...parsed.output, slug: slugOf(key), load };
		})
		.sort(
			(a, b) =>
				wikiSections.indexOf(a.section) - wikiSections.indexOf(b.section) ||
				a.order - b.order ||
				a.title.localeCompare(b.title),
		);
}

export const wikiPages = buildPages(
	frontMatter,
	import.meta.glob("./pages/**/*.md") as Record<string, () => Promise<{ default: Component }>>,
);

/** Where the page of `slug` is served. */
export const pageHref = (slug: string) => `/wiki/${slug}`;

export function pageBySlug(slug: string): WikiPage | undefined {
	return wikiPages.find((page) => page.slug === slug);
}

/** The sidebar: a group per section that has pages, its pages linked under `/wiki`. */
export function wikiNav(pages: readonly WikiPage[] = wikiPages): NavGroup[] {
	return wikiSections.flatMap((section) => {
		const inSection = pages.filter((page) => page.section === section);
		if (inSection.length === 0) return [];
		const { title, icon } = sectionInfo[section];
		return [
			{
				label: title,
				items: inSection.map((page) => ({
					id: page.slug,
					title: page.title,
					href: pageHref(page.slug),
					icon,
				})),
			},
		];
	});
}
