/**
 * The wiki's page registry (`#wiki/pages.ts`): each page's slug, its front-matter checked against
 * the app (the modules, domains, shells and themes it may cover), the order of the pages and the
 * sidebar's groups.
 */
import type { Component } from "svelte";
import { describe, expect, test } from "vite-plus/test";

import { buildPages, pageBySlug, wikiNav, wikiPages } from "#wiki/pages.ts";
import { sectionInfo } from "#wiki/sections.ts";

const page = {} as Component;
const loader = async () => ({ default: page });

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
		expect(pages[0]?.headings).toEqual(headings);
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
		expect(groups.map((g) => g.label)).toEqual([sectionInfo.start.title, sectionInfo.orders.title]);
		expect(groups.map((g) => g.items.map((i) => i.href))).toEqual([
			["/wiki/start/a"],
			["/wiki/orders/b"],
		]);
		expect(groups[0]?.items[0]?.icon).toBe(sectionInfo.start.icon);
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
		expect(page?.headings).toContainEqual({ text: "Try the moves", id: "try-the-moves" });
		expect((await page!.load()).default).toBeTypeOf("function");
	});
});
