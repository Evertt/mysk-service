/**
 * The wiki's page registry (`#wiki/pages.ts`): each page's slug, its front-matter checked against
 * the app (the modules, domains, shells and themes it may cover), its Dutch twin (`<page>.nl.md`),
 * the text a visitor reads in their language (`pageText()`), the order of the pages and the
 * sidebar's groups.
 */
import type { Component } from "svelte";
import { afterEach, describe, expect, test } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import { buildPages, pageBySlug, pageText, wikiNav, wikiPages } from "#wiki/pages.ts";
import { sectionInfo } from "#wiki/sections.ts";

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

const page = {} as Component;
const loader = async () => ({ default: page });
const dutchPage = {} as Component;
const dutchLoader = async () => ({ default: dutchPage });

/** Front-matter that passes, with `overrides`. */
const meta = (overrides: Record<string, unknown> = {}) => ({
	title: "A page",
	summary: "What it says.",
	section: "start",
	order: 1,
	status: "built",
	covers: [],
	...overrides,
});

describe("buildPages", () => {
	test("slugs drop ./pages/ and the extension", () => {
		const pages = buildPages(
			{ "./pages/orders/lifecycle.md": meta({ section: "orders" }) },
			{ "./pages/orders/lifecycle.md": loader },
		);
		expect(pages.map((p) => p.slug)).toEqual(["orders/lifecycle"]);
	});

	test("sorts by section, then order, then title", () => {
		const pages = buildPages(
			{
				"./pages/orders/b.md": meta({ title: "B", section: "orders", order: 1 }),
				"./pages/orders/a.md": meta({ title: "A", section: "orders", order: 1 }),
				"./pages/orders/first.md": meta({ title: "First", section: "orders", order: 0 }),
				"./pages/start/z.md": meta({ title: "Z", section: "start", order: 9 }),
			},
			{
				"./pages/orders/b.md": loader,
				"./pages/orders/a.md": loader,
				"./pages/orders/first.md": loader,
				"./pages/start/z.md": loader,
			},
		);
		expect(pages.map((p) => p.slug)).toEqual(["start/z", "orders/first", "orders/a", "orders/b"]);
	});

	test("refuses an unknown section, naming the file", () => {
		expect(() =>
			buildPages({ "./pages/x/y.md": meta({ section: "billing" }) }, { "./pages/x/y.md": loader }),
		).toThrow("./pages/x/y.md");
	});

	test("refuses a covers key that names no module", () => {
		expect(() =>
			buildPages(
				{ "./pages/x/y.md": meta({ covers: ["module:nope"] }) },
				{ "./pages/x/y.md": loader },
			),
		).toThrow("./pages/x/y.md");
	});

	test("takes covers keys for a domain, a shell and a theme", () => {
		const pages = buildPages(
			{
				"./pages/x/y.md": meta({
					covers: ["domain:orders", "shell:engineer", "theme:lagoon"],
				}),
			},
			{ "./pages/x/y.md": loader },
		);
		expect(pages[0]?.covers).toEqual(["domain:orders", "shell:engineer", "theme:lagoon"]);
	});

	test("refuses a page without front-matter, naming the file", () => {
		expect(() => buildPages({ "./pages/x/y.md": null }, { "./pages/x/y.md": loader })).toThrow(
			"./pages/x/y.md",
		);
		// A page the front-matter's module doesn't list at all.
		expect(() => buildPages({}, { "./pages/x/z.md": loader })).toThrow("./pages/x/z.md");
	});

	test("refuses front-matter without a page to load, naming the file", () => {
		expect(() => buildPages({ "./pages/x/y.md": meta() }, {})).toThrow("./pages/x/y.md: no loader");
	});

	test("takes the headings with their ids", () => {
		const headings = [{ text: "Until it’s decided", id: "until-its-decided" }];
		const pages = buildPages(
			{ "./pages/x/y.md": meta({ headings }) },
			{ "./pages/x/y.md": loader },
		);
		expect(pages[0]?.text.en.headings).toEqual(headings);
	});
});

describe("twins", () => {
	/** A page and its Dutch twin, with the twin's front-matter `twin`. */
	const pair = (twin: unknown = { title: "Een pagina", summary: "Wat er staat." }) =>
		buildPages(
			{ "./pages/x/y.md": meta(), "./pages/x/y.nl.md": twin },
			{ "./pages/x/y.md": loader, "./pages/x/y.nl.md": dutchLoader },
		);

	test("a twin is no page of its own: it is the page's Dutch text", async () => {
		const headings = [{ text: "Wat het doet", id: "wat-het-doet" }];
		const pages = pair({ title: "Een pagina", summary: "Wat er staat.", headings });
		expect(pages.map((p) => p.slug)).toEqual(["x/y"]);
		expect(pages[0]?.text.nl).toMatchObject({
			title: "Een pagina",
			summary: "Wat er staat.",
			headings,
		});
		expect((await pages[0]!.text.nl!.load()).default).toBe(dutchPage);
		expect((await pages[0]!.text.en.load()).default).toBe(page);
	});

	test("a page without a twin has English only", () => {
		const pages = buildPages({ "./pages/x/y.md": meta() }, { "./pages/x/y.md": loader });
		expect(Object.keys(pages[0]!.text)).toEqual(["en"]);
	});

	test("a twin's headings default to none", () => {
		expect(pair()[0]?.text.nl?.headings).toEqual([]);
	});

	test("refuses a twin with front-matter beyond its title and summary, naming it", () => {
		expect(() => pair({ title: "Een pagina", summary: "Wat er staat.", section: "start" })).toThrow(
			"./pages/x/y.nl.md",
		);
	});

	test("refuses a twin without its title or summary, or without front-matter, naming it", () => {
		expect(() => pair({ title: "Een pagina" })).toThrow("./pages/x/y.nl.md");
		expect(() => pair(null)).toThrow("./pages/x/y.nl.md");
	});

	test("refuses a twin without its page, naming it", () => {
		expect(() =>
			buildPages(
				{ "./pages/x/y.nl.md": { title: "Een pagina", summary: "Wat er staat." } },
				{ "./pages/x/y.nl.md": dutchLoader },
			),
		).toThrow("./pages/x/y.nl.md: a twin without its page ./pages/x/y.md");
	});

	test("refuses a twin without a loader, naming it", () => {
		expect(() =>
			buildPages(
				{
					"./pages/x/y.md": meta(),
					"./pages/x/y.nl.md": { title: "Een pagina", summary: "Wat er staat." },
				},
				{ "./pages/x/y.md": loader },
			),
		).toThrow("./pages/x/y.nl.md: no loader");
	});

	test("sorts by the English title, whatever the twins say", () => {
		const pages = buildPages(
			{
				"./pages/start/a.md": meta({ title: "A" }),
				"./pages/start/a.nl.md": { title: "Z", summary: "." },
				"./pages/start/b.md": meta({ title: "B" }),
			},
			{
				"./pages/start/a.md": loader,
				"./pages/start/a.nl.md": dutchLoader,
				"./pages/start/b.md": loader,
			},
		);
		expect(pages.map((p) => p.slug)).toEqual(["start/a", "start/b"]);
	});
});

describe("pageText", () => {
	const [translated] = buildPages(
		{
			"./pages/x/y.md": meta({ title: "A page" }),
			"./pages/x/y.nl.md": { title: "Een pagina", summary: "Wat er staat." },
		},
		{ "./pages/x/y.md": loader, "./pages/x/y.nl.md": dutchLoader },
	);
	const [english] = buildPages({ "./pages/x/z.md": meta() }, { "./pages/x/z.md": loader });

	test("Dutch is the twin, in Dutch", () => {
		expect(pageText(translated!, "nl")).toMatchObject({ title: "Een pagina", lang: "nl" });
	});

	test("Dutch without a twin is the English page, marked English", () => {
		expect(pageText(english!, "nl")).toMatchObject({ title: "A page", lang: "en" });
	});

	test("English is the page", () => {
		expect(pageText(translated!, "en")).toMatchObject({ title: "A page", lang: "en" });
	});

	test("reads the current language by default", () => {
		expect(pageText(translated!).lang).toBe("en");
		overwriteGetLocale(() => "nl");
		expect(pageText(translated!)).toMatchObject({ title: "Een pagina", lang: "nl" });
	});
});

describe("wikiNav", () => {
	test("makes a group per section with pages", () => {
		const pages = buildPages(
			{
				"./pages/start/a.md": meta({ section: "start" }),
				"./pages/orders/b.md": meta({ section: "orders" }),
			},
			{ "./pages/start/a.md": loader, "./pages/orders/b.md": loader },
		);
		const groups = wikiNav(pages);
		expect(groups.map((g) => g.label)).toEqual([
			sectionInfo.start.title(),
			sectionInfo.orders.title(),
		]);
		expect(groups.map((g) => g.items.map((i) => i.href))).toEqual([
			["/wiki/start/a"],
			["/wiki/orders/b"],
		]);
		expect(groups[0]?.items[0]?.icon).toBe(sectionInfo.start.icon);
	});

	test("titles the pages in the current language, English where a page has no twin", () => {
		const pages = buildPages(
			{
				"./pages/start/a.md": meta({ title: "A page" }),
				"./pages/start/a.nl.md": { title: "Een pagina", summary: "Wat er staat." },
				"./pages/start/b.md": meta({ title: "B page" }),
			},
			{
				"./pages/start/a.md": loader,
				"./pages/start/a.nl.md": dutchLoader,
				"./pages/start/b.md": loader,
			},
		);
		const titles = () => wikiNav(pages).flatMap((group) => group.items.map((item) => item.title));
		expect(titles()).toEqual(["A page", "B page"]);
		overwriteGetLocale(() => "nl");
		expect(titles()).toEqual(["Een pagina", "B page"]);
	});
});

describe("the real pages", () => {
	test("load", () => {
		expect(wikiPages.length).toBeGreaterThan(0);
		expect(pageBySlug("start/what-fieldworks-is")).toBeDefined();
		expect(pageBySlug("nope/nothing")).toBeUndefined();
	});

	test("one page loads by its slug, with its component", async () => {
		const page = pageBySlug("orders/lifecycle");
		expect(page?.text.en.headings).toContainEqual({ text: "Try the moves", id: "try-the-moves" });
		expect((await page!.text.en.load()).default).toBeTypeOf("function");
	});

	test("a page with its twin has its Dutch text, which loads", async () => {
		const page = pageBySlug("start/what-fieldworks-is");
		expect(page?.text.nl?.title).toBe("Wat Fieldworks is");
		expect(page?.text.nl?.headings.length).toBe(page?.text.en.headings.length);
		expect((await page!.text.nl!.load()).default).toBeTypeOf("function");
		expect(pageBySlug("start/what-fieldworks-is.nl")).toBeUndefined();
	});
});
