/**
 * The wiki's Markdown pass (`scripts/wiki-headings.ts`), run through mdsvex as the build runs it: a
 * page's `##` headings go into its front-matter, each with the `id` it gets in the page, which the
 * search links to; and `readWikiPages()`, which the virtual module `virtual:wiki-pages` is made of.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compile } from "mdsvex";
import { describe, expect, test } from "vite-plus/test";

import { readWikiPages, wikiMdsvex } from "./wiki-pages.ts";

/** A page of `body` with front-matter, compiled: its front-matter and its HTML. */
async function compiled(body: string) {
	const result = await compile(`---\ntitle: A page\n---\n\n${body}`, {
		...wikiMdsvex,
		filename: "made-up.md",
	});
	return { fm: result?.data?.fm as Record<string, unknown> | undefined, code: result?.code ?? "" };
}

describe("the headings pass", () => {
	test("lists the ## headings, with the id each has in the page", async () => {
		const { fm, code } = await compiled(
			"## What the office sees\n\nText.\n\n## Until it's decided",
		);
		expect(fm?.headings).toEqual([
			{ text: "What the office sees", id: "what-the-office-sees" },
			// Smartypants curls the quote; the id drops it.
			{ text: "Until it’s decided", id: "until-its-decided" },
		]);
		expect(code).toContain('<h2 id="what-the-office-sees">');
		expect(code).toContain('<h2 id="until-its-decided">');
	});

	test("a heading reads without its Markdown", async () => {
		const { fm } = await compiled("## The `orders` table, *scoped*");
		expect(fm?.headings).toEqual([
			{ text: "The orders table, scoped", id: "the-orders-table-scoped" },
		]);
	});

	test("a repeated heading gets a numbered id, as on GitHub", async () => {
		const { fm, code } = await compiled("## Notes\n\n## Notes\n\n## Notes");
		expect(fm?.headings).toEqual([
			{ text: "Notes", id: "notes" },
			{ text: "Notes", id: "notes-1" },
			{ text: "Notes", id: "notes-2" },
		]);
		expect(code).toContain('<h2 id="notes-2">');
	});

	test("leaves other levels alone", async () => {
		const { fm, code } = await compiled("### Detail\n\n## Main");
		expect(fm?.headings).toEqual([{ text: "Main", id: "main" }]);
		expect(code).toContain("<h3>Detail</h3>");
	});

	test("a file without front-matter gets none", async () => {
		const result = await compile("## Main", { ...wikiMdsvex, filename: "made-up.md" });
		expect(result?.data?.fm).toBeUndefined();
	});
});

describe("readWikiPages", () => {
	test("each page's front-matter by its key under src/wiki, null where it has none", async () => {
		const dir = mkdtempSync(join(tmpdir(), "wiki-pages-"));
		try {
			mkdirSync(join(dir, "orders"));
			writeFileSync(join(dir, "orders/lifecycle.md"), "---\ntitle: Lifecycle\n---\n\n## Moves\n");
			writeFileSync(join(dir, "loose.md"), "No front-matter.\n");
			writeFileSync(join(dir, "notes.txt"), "---\ntitle: Not a page\n---\n");
			expect(await readWikiPages(dir)).toEqual({
				"./pages/loose.md": null,
				"./pages/orders/lifecycle.md": {
					title: "Lifecycle",
					headings: [{ text: "Moves", id: "moves" }],
				},
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reads the real pages", async () => {
		const pages = await readWikiPages(join(import.meta.dirname, "../src/wiki/pages"));
		expect(pages["./pages/orders/lifecycle.md"]).toMatchObject({
			title: "Order lifecycle",
			headings: expect.arrayContaining([{ text: "Try the moves", id: "try-the-moves" }]),
		});
	});
});
