/**
 * The wiki's links hold. The pages are server-rendered, so no build step checks them: this reads
 * every file in `src/wiki` as text and refuses
 *
 * - a `<SourceLink path="…">` to a file that doesn't exist (relative to the project root),
 * - a `<DocsPointer doc="…">` to a file that doesn't exist (a path under `docs/agents/`, an
 *   `#anchor` ignored),
 * - a link to `/wiki/<slug>` (`href="…"` or a Markdown `](…)`) that no page answers, an `#anchor`
 *   or `?query` ignored.
 *
 * Failures list `file:line → target`. The checks also run on made-up text, to show they find what
 * they should.
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { pageBySlug } from "#wiki/pages.ts";

const root = join(import.meta.dirname, "../../../..");

const wikiFiles = () =>
	globSync("src/wiki/**/*.{md,svelte}", { cwd: root }).map((path) => ({
		path,
		source: readFileSync(join(root, path), "utf8"),
	}));

/** `{ line, target }` of every match of `pattern`'s first group in `source`, with 1-based lines. */
function references(source: string, pattern: RegExp) {
	return source.split("\n").flatMap((text, index) =>
		[...text.matchAll(new RegExp(pattern, "g"))].map((match) => ({
			line: index + 1,
			target: match[1] ?? match[2] ?? "",
		})),
	);
}

const sourceLink = /<SourceLink\b[^>]*?\bpath="([^"]*)"/;
const docsPointer = /<DocsPointer\b[^>]*?\bdoc="([^"]*)"/;
/** `href="/wiki/…"` in markup or `](/wiki/…)` in Markdown; group 1 or 2 is the whole path. */
const wikiLink = /href="(\/wiki(?:[/?#][^"]*)?)"|\]\((\/wiki(?:[/?#][^)\s]*)?)/;

/** `/wiki/orders/lifecycle#x?y` is the slug `orders/lifecycle`; `/wiki` itself is `""`. */
const slugOf = (href: string) =>
	href
		.replace(/^\/wiki\/?/, "")
		.replace(/[?#].*$/, "")
		.replace(/\/$/, "");

/** `file:line → target` of every reference of `pattern` in `files` whose target `broken` refuses. */
function brokenReferences(
	files: { path: string; source: string }[],
	pattern: RegExp,
	broken: (target: string) => boolean,
) {
	return files.flatMap((file) =>
		references(file.source, pattern)
			.filter(({ target }) => broken(target))
			.map(({ line, target }) => `${file.path}:${line} → ${target}`),
	);
}

const missingFile = (path: string) => path === "" || !existsSync(join(root, path));
const missingDoc = (doc: string) => {
	const path = doc.replace(/#.*$/, "");
	return path === "" || !existsSync(join(root, path));
};
/** The wiki's own index (`/wiki`) answers without a page. */
const missingPage = (href: string) => {
	const slug = slugOf(href);
	return slug !== "" && !pageBySlug(slug);
};

describe("the wiki's links", () => {
	test("every SourceLink names a file that exists", () => {
		expect(brokenReferences(wikiFiles(), sourceLink, missingFile)).toEqual([]);
	});

	test("every DocsPointer names a file that exists", () => {
		expect(brokenReferences(wikiFiles(), docsPointer, missingDoc)).toEqual([]);
	});

	test("every link between wiki pages has a page", () => {
		expect(brokenReferences(wikiFiles(), wikiLink, missingPage)).toEqual([]);
	});

	describe("the checks find what they should (made-up text)", () => {
		const made = (source: string) => [{ path: "made-up.md", source }];

		test("a SourceLink to a missing file", () => {
			const files = made(
				[
					'<SourceLink path="package.json" />',
					'text <SourceLink label="x" path="src/lib/nothing-here.ts" />',
				].join("\n"),
			);
			expect(brokenReferences(files, sourceLink, missingFile)).toEqual([
				"made-up.md:2 → src/lib/nothing-here.ts",
			]);
		});

		test("a DocsPointer to a missing file, an anchor ignored", () => {
			const files = made(
				[
					'<DocsPointer doc="docs/agents/kit.md#permissions" />',
					'<DocsPointer doc="docs/agents/no-such-doc.md#x" />',
				].join("\n"),
			);
			expect(brokenReferences(files, docsPointer, missingDoc)).toEqual([
				"made-up.md:2 → docs/agents/no-such-doc.md#x",
			]);
		});

		test("a link to a wiki page that doesn't exist", () => {
			const files = made(
				[
					"[start](/wiki/start/what-fieldworks-is#top) and [index](/wiki)",
					"[gone](/wiki/orders/no-such-page?x=1) and",
					'<a href="/wiki/nowhere">gone</a> <a href="https://example.com/wiki/x">other</a>',
				].join("\n"),
			);
			expect(brokenReferences(files, wikiLink, missingPage)).toEqual([
				"made-up.md:2 → /wiki/orders/no-such-page?x=1",
				"made-up.md:3 → /wiki/nowhere",
			]);
		});
	});
});
