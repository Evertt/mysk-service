/**
 * The wiki's pages. Each file in `./pages` is an mdsvex `.md` page that starts with front-matter,
 * which `buildPages()` checks against the app: the section, and what the page `covers`, which must
 * be a module, core domain, shell or theme that exists. The guards read `covers` to see what the
 * wiki says about each; the route, the sidebar and the search read the rest.
 *
 * A page is in English, and may have a Dutch twin beside it, `<page>.nl.md` (docs/plans/wiki-dutch.md),
 * whose front-matter is only what's translated: `title` and `summary` (and the `headings` the build
 * adds). A twin is no page of its own (no slug, no sidebar entry, no coverage): it is its page's
 * text in Dutch. `twins.spec.ts` keeps each twin built like its page.
 *
 * The API:
 *
 * - `WikiPage`: what a page is in every language (`slug`, `section`, `order`, `status`, `covers`),
 *   and `text`, its `PageText` per language: `text.en` always, `text.nl` where the twin exists.
 * - `PageText`: `title`, `summary`, `headings` (`{ text, id }`, the ids of that language's page)
 *   and `load()`, which imports that language's page component.
 * - `pageText(page, locale = getLocale())`: the text a visitor in `locale` reads, the twin where
 *   there is one and else English, with `lang`, the language it is in (`en` where it fell back).
 *   Everything that shows a page's title, summary or headings reads them through it.
 * - `wikiPages` (sorted by section, `order`, then English title), `pageBySlug(slug)`,
 *   `pageHref(slug)`, and `wikiNav(pages?, locale?)`, the sidebar in the current language.
 *
 * The front-matter comes from `virtual:wiki-pages` (`scripts/wiki-pages.ts`), read at build time,
 * not from the pages' modules: so a wiki page's chunk holds that page alone, in one language, and
 * the route loads it by its slug and language (`load`).
 */
import type { Component } from "svelte";
import * as v from "valibot";
import frontMatter from "virtual:wiki-pages";

import { shells, type ShellName } from "#lib/auth/shells.ts";
import { moduleIds, type ModuleId } from "#lib/modules/ids.ts";
import type { NavGroup } from "#lib/modules/nav.ts";
import { baseLocale, getLocale, locales, type Locale } from "#lib/paraglide/runtime.js";
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

/** A page's text in one language: what the visitor reads, and its page component. */
export interface PageText {
	title: string;
	summary: string;
	/** Its `##` headings, which the build adds to its front-matter, with their ids in that language. */
	headings: { text: string; id: string }[];
	load: () => Promise<{ default: Component }>;
}

export interface WikiPage {
	/** Path under `/wiki`, e.g. `orders/lifecycle`. */
	slug: string;
	section: WikiSection;
	order: number;
	status: "built" | "partly built" | "planned";
	covers: Coverage[];
	/** Its text per language: English always, another where its twin (`<page>.<locale>.md`) is written. */
	text: { en: PageText } & Partial<Record<Locale, PageText>>;
}

const shellNames = Object.keys(shells) as ShellName[];

const coverage = v.picklist([
	...moduleIds.map((id) => `module:${id}` as const),
	...coreDomains.map((name) => `domain:${name}` as const),
	...shellNames.map((name) => `shell:${name}` as const),
	...themeNames.map((name) => `theme:${name}` as const),
]);

const headingList = v.optional(v.array(v.object({ text: v.string(), id: v.string() })), []);

const pageMeta = v.object({
	title: v.pipe(v.string(), v.nonEmpty()),
	summary: v.pipe(v.string(), v.nonEmpty()),
	section: v.picklist(wikiSections),
	order: v.number(),
	status: v.picklist(["built", "partly built", "planned"]),
	covers: v.array(coverage),
	headings: headingList,
});

/** A twin's front-matter: what's translated, and nothing that is the page's alone. */
const twinMeta = v.strictObject({
	title: v.pipe(v.string(), v.nonEmpty()),
	summary: v.pipe(v.string(), v.nonEmpty()),
	headings: headingList,
});

/** The languages a page may have a twin in: every one but English, the pages' own. */
const twinLocales = locales.filter((locale) => locale !== baseLocale);

/** The path under `/wiki` of the page file `./pages/<slug>.md`. */
const slugOf = (key: string) => key.replace(/^\.\/pages\//, "").replace(/\.md$/, "");

/** A file's page key and the language of its twin: `./pages/x/y.nl.md` is `./pages/x/y.md`'s `nl`. */
function fileOf(key: string): { page: string; locale: Locale } {
	const locale = twinLocales.find((candidate) => key.endsWith(`.${candidate}.md`));
	return locale
		? { page: key.replace(new RegExp(`\\.${locale}\\.md$`), ".md"), locale }
		: { page: key, locale: baseLocale };
}

/** `schema`'s output for the file `key`'s front-matter; throws, naming the file, where it's wrong. */
function parsed<S extends v.GenericSchema>(schema: S, key: string, metadata: unknown) {
	const result = v.safeParse(schema, metadata);
	if (result.success) return result.output as v.InferOutput<S>;
	const problems = result.issues.map((issue) => {
		const path = v.getDotPath(issue);
		return path ? `${path}: ${issue.message}` : issue.message;
	});
	throw new Error(`Wiki page ${key}: bad front-matter (${problems.join("; ")})`);
}

/**
 * The pages of these files (`metadata` as `virtual:wiki-pages` holds it, and `loaders` as
 * `import.meta.glob` makes them, both by file key), each with its twins' text, sorted by section,
 * then `order`, then English title. Throws on the first file whose front-matter is wrong or
 * missing, or that has no loader, and on a twin without its page, naming it and what is wrong.
 */
export function buildPages(
	metadata: Record<string, unknown>,
	loaders: Record<string, () => Promise<{ default: Component }>>,
): WikiPage[] {
	const keys = [...new Set([...Object.keys(metadata), ...Object.keys(loaders)])];
	const loaderOf = (key: string) => {
		const load = loaders[key];
		if (!load) throw new Error(`Wiki page ${key}: no loader`);
		return load;
	};
	const pages = new Map<string, WikiPage>();
	for (const key of keys) {
		if (fileOf(key).locale !== baseLocale) continue;
		const { title, summary, headings, ...shared } = parsed(pageMeta, key, metadata[key]);
		pages.set(key, {
			...shared,
			slug: slugOf(key),
			text: { en: { title, summary, headings, load: loaderOf(key) } },
		});
	}
	for (const key of keys) {
		const { page, locale } = fileOf(key);
		if (locale === baseLocale) continue;
		const text = parsed(twinMeta, key, metadata[key]);
		const own = pages.get(page);
		if (!own) throw new Error(`Wiki page ${key}: a twin without its page ${page}`);
		own.text[locale] = { ...text, load: loaderOf(key) };
	}
	return [...pages.values()].sort(
		(a, b) =>
			wikiSections.indexOf(a.section) - wikiSections.indexOf(b.section) ||
			a.order - b.order ||
			a.text.en.title.localeCompare(b.text.en.title),
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

/**
 * The text of `page` a visitor in `locale` reads: its twin in that language, or else the English
 * page; `lang` is the language of what it returns (`en` where it fell back).
 */
export function pageText(
	page: WikiPage,
	locale: Locale = getLocale(),
): PageText & { lang: Locale } {
	const text = page.text[locale];
	return text ? { ...text, lang: locale } : { ...page.text.en, lang: baseLocale };
}

/**
 * The sidebar: a group per section that has pages, its pages linked under `/wiki`, titled in
 * `locale` (`pageText()`).
 */
export function wikiNav(
	pages: readonly WikiPage[] = wikiPages,
	locale: Locale = getLocale(),
): NavGroup[] {
	return wikiSections.flatMap((section) => {
		const inSection = pages.filter((page) => page.section === section);
		if (inSection.length === 0) return [];
		const { title, icon } = sectionInfo[section];
		return [
			{
				label: title,
				items: inSection.map((page) => ({
					id: page.slug,
					title: pageText(page, locale).title,
					href: pageHref(page.slug),
					icon,
				})),
			},
		];
	});
}
