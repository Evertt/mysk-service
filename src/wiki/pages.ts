/**
 * The wiki's pages. Each file in `./pages` (an mdsvex `.md` or a `.svelte` page) starts with
 * front-matter (a `.svelte` page exports it as `metadata` from `<script module>`), which
 * `buildPages()` checks against the app: the section, and what the page `covers`, which must be a
 * module, core domain, shell or theme that exists. The guards read `covers` to see what the wiki
 * says about each; the route and the sidebar read the rest.
 */
import type { Component } from "svelte";
import * as v from "valibot";

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
	/** The page's `##` headings, which the build adds to its front-matter (`scripts/wiki-headings.ts`). */
	headings: string[];
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
	headings: v.optional(v.array(v.string()), []),
});

/** The path under `/wiki` of the page file `./pages/<slug>.md`. */
const slugOf = (key: string) => key.replace(/^\.\/pages\//, "").replace(/\.(?:md|svelte)$/, "");

/**
 * The pages of these files (`metadata` and `loaders` by file key, as `import.meta.glob` makes
 * them), sorted by section, then `order`, then title. Throws on the first file whose front-matter
 * is wrong, naming it and what is wrong.
 */
export function buildPages(
	metadata: Record<string, unknown>,
	loaders: Record<string, () => Promise<{ default: Component }>>,
): WikiPage[] {
	return Object.entries(metadata)
		.map(([key, input]): WikiPage => {
			const parsed = v.safeParse(pageMeta, input);
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
	import.meta.glob("./pages/**/*.{md,svelte}", { eager: true, import: "metadata" }),
	import.meta.glob("./pages/**/*.{md,svelte}") as Record<
		string,
		() => Promise<{ default: Component }>
	>,
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
