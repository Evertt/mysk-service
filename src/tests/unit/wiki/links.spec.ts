/**
 * The wiki's links hold. The pages are server-rendered, so no build step checks them: this reads
 * every file in `src/wiki` as text and refuses
 *
 * - a `<SourceLink path="…">` to a file that doesn't exist (relative to the project root),
 * - a `<DocsPointer doc="…">` to a file that doesn't exist (a path under `docs/agents/`, an
 *   `#anchor` ignored),
 * - a link to `/wiki/<slug>` that no page answers (an `href`, a Markdown `](…)` or a reference-style
 *   `[t]: …`; an `#anchor` or `?query` ignored),
 * - a `<SourceLink>` or `<DocsPointer>` whose path this spec can't read (no `path`, a computed
 *   one, a template with `${…}`), or an `href` with `/wiki` in an expression it can't read: they
 *   fail as `unreadable`, so nothing passes on nothing;
 * - a `<SourceLink line={N}>` whose line N doesn't hold what it links to: the identifier its
 *   `symbol` names, or else the one its label names (in `<code>`, or a label that is one, like
 *   `moveOrderStock()`). The links point at the commit the wiki was built from, but the next edit
 *   to a file moves its lines, and the page is written against the current file; a label that
 *   names no identifier needs a `symbol`.
 *
 * Tags may span lines; attributes may be quoted either way or a literal in braces (`{'…'}`).
 * Failures list `file:line → target`. The checks also run on made-up text, to show they find what
 * they should.
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { pageBySlug, wikiPages } from "#wiki/pages.ts";

const root = join(import.meta.dirname, "../../../..");

const wikiFiles = () =>
	globSync("src/wiki/**/*.{md,svelte}", { cwd: root }).map((path) => ({
		path,
		source: readFileSync(join(root, path), "utf8"),
	}));

const UNREADABLE = "unreadable";

/** A reference in a file: where it starts and what it points at (`null`: it can't be read). */
interface Reference {
	index: number;
	target: string | null;
}

/** An opening tag, whole: quoted values and `{…}` expressions may hold a `>`. */
const openingTag = /<[A-Za-z][\w.]*(?:[^>"'{]|"[^"]*"|'[^']*'|\{[^}]*\})*>/y;

/** The value of the attribute `name` in `tag`, if it's a string literal in quotes or in braces. */
function attribute(tag: string, name: string): string | null {
	const match = new RegExp(
		`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*(?:"([^"]*)"|'([^']*)'|\`([^\`]*)\`)\\s*\\})`,
	).exec(tag);
	const value = match?.slice(1).find((group) => group !== undefined);
	return value === undefined || value === "" || value.includes("${") ? null : value;
}

/** Every `<tag …>` of `source` with its `name` attribute: whole tags, over lines. */
function tagReferences(tag: string, name: string) {
	return (source: string): Reference[] =>
		[...source.matchAll(new RegExp(`<${tag}(?![\\w.-])`, "g"))].map((match) => {
			openingTag.lastIndex = match.index;
			const whole = openingTag.exec(source)?.[0];
			return { index: match.index, target: whole ? attribute(whole, name) : null };
		});
}

/** The links to `/wiki` in markup (`href`), Markdown (`](…)`) and reference-style Markdown. */
function wikiLinks(source: string): Reference[] {
	const wiki = "\\/wiki(?:[/?#][^\"'`)>\\s]*)?";
	const found = new Map<number, Reference>();
	const add = (pattern: RegExp) => {
		for (const match of source.matchAll(pattern)) {
			const target = match[2] ?? "";
			found.set(match.index, { index: match.index, target: target.includes("${") ? null : target });
		}
	};
	add(new RegExp(`href\\s*=\\s*(["'])(${wiki})\\1`, "g"));
	add(new RegExp(`href\\s*=\\s*\\{\\s*(["'\`])(${wiki})\\1\\s*\\}`, "g"));
	add(new RegExp(`(\\])\\(\\s*<?(${wiki})`, "g"));
	add(new RegExp(`^( {0,3}\\[[^\\]]+\\]:)[ \\t]*<?(${wiki})`, "gm"));
	// An `href` expression with /wiki in it that none of the above could read.
	for (const match of source.matchAll(/href\s*=\s*\{[^}]*\/wiki[^}]*\}/g)) {
		if (!found.has(match.index)) found.set(match.index, { index: match.index, target: null });
	}
	return [...found.values()].sort((a, b) => a.index - b.index);
}

/** `/wiki/orders/lifecycle#x?y` is the slug `orders/lifecycle`; `/wiki` itself is `""`. */
const slugOf = (href: string) =>
	href
		.replace(/^\/wiki\/?/, "")
		.replace(/[?#].*$/, "")
		.replace(/\/$/, "");

/** `file:line → target` of every reference in `files` that's unreadable or that `broken` refuses. */
function brokenReferences(
	files: { path: string; source: string }[],
	references: (source: string) => Reference[],
	broken: (target: string) => boolean,
) {
	return files.flatMap((file) =>
		references(file.source)
			.filter(({ target }) => target === null || broken(target))
			.map(({ index, target }) => {
				const line = file.source.slice(0, index).split("\n").length;
				return `${file.path}:${line} → ${target ?? UNREADABLE}`;
			}),
	);
}

const missingFile = (path: string) => !existsSync(join(root, path));
const missingDoc = (doc: string) => missingFile(doc.replace(/#.*$/, ""));
/** The wiki's own index (`/wiki`) answers without a page. */
const missingPage = (href: string) => {
	const slug = slugOf(href);
	return slug !== "" && !pageBySlug(slug);
};

const sourceLinks = tagReferences("SourceLink", "path");

/** A `<SourceLink>` with a `line`: where it is, its `path`, `line`, `symbol` and label. */
interface LineLink {
	index: number;
	path: string | null;
	/** `null`: a `line` that isn't a number literal. */
	line: number | null;
	symbol: string | null;
	label: string;
}

/** Every `<SourceLink>` of `source` with a `line`, its label the markup up to `</SourceLink>`. */
function lineLinks(source: string): LineLink[] {
	return [...source.matchAll(/<SourceLink(?![\w.-])/g)].flatMap((match): LineLink[] => {
		openingTag.lastIndex = match.index;
		const whole = openingTag.exec(source)?.[0];
		if (!whole || !/(?<![\w-])line\s*=/.test(whole)) return [];
		const line = /(?<![\w-])line\s*=\s*(?:\{\s*(\d+)\s*\}|"(\d+)"|'(\d+)')/.exec(whole);
		const after = match.index + whole.length;
		const close = whole.endsWith("/>") ? -1 : source.indexOf("</SourceLink>", after);
		return [
			{
				index: match.index,
				path: attribute(whole, "path"),
				line: line ? Number(line[1] ?? line[2] ?? line[3]) : null,
				symbol: attribute(whole, "symbol"),
				label: close === -1 ? "" : source.slice(after, close),
			},
		];
	});
}

/** A label that is an identifier: `mayRead`, `moveOrderStock()`, `dashboard.stats`, not a file. */
const identifier = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?$/;
const fileName = /\.(?:ts|js|svelte|md|json|css)$/;

/** The identifiers a link's label names: its `<code>`s, or the label if it is one. */
function labelIdentifiers(label: string): string[] {
	const codes = [...label.matchAll(/<code>([^<]*)<\/code>/g)].map(([, code]) => code.trim());
	const named = codes.length > 0 ? codes : [label.trim()];
	return named
		.filter((name) => identifier.test(name) && !fileName.test(name))
		.map((name) => name.replace(/\(\)$/, ""));
}

/** Whether `text` holds `name` as a whole identifier. */
const holds = (text: string, name: string) =>
	new RegExp(`(?<![\\w$])${name.replace(/[.$]/g, "\\$&")}(?![\\w$])`).test(text);

/** Line `n` (from 1) of the file at `path` from the project root, `undefined` past its end. */
const lineOf = (path: string, n: number) =>
	existsSync(join(root, path))
		? readFileSync(join(root, path), "utf8").split("\n")[n - 1]
		: undefined;

/**
 * `file:line → path:N …` of every line link in `files` whose line doesn't hold what it links to:
 * its `symbol`, else one of the identifiers its label names. A link whose `line` or `path` can't
 * be read, or that names nothing to look for, fails too.
 */
function driftedLines(
	files: { path: string; source: string }[],
	read: (path: string, n: number) => string | undefined = lineOf,
) {
	return files.flatMap((file) =>
		lineLinks(file.source).flatMap(({ index, path, line, symbol, label }) => {
			const at = `${file.path}:${file.source.slice(0, index).split("\n").length}`;
			if (path === null || line === null) return [`${at} → ${UNREADABLE}`];
			const names = symbol ? [symbol] : labelIdentifiers(label);
			if (names.length === 0)
				return [`${at} → ${path}:${line}: names no identifier (add a symbol)`];
			const text = read(path, line);
			if (text !== undefined && names.some((name) => holds(text, name))) return [];
			return [`${at} → ${path}:${line} lacks ${names.join(" or ")}`];
		}),
	);
}
const docsPointers = tagReferences("DocsPointer", "doc");

describe("the wiki's links", () => {
	test("reads the wiki's files: at least every page, and the parts", () => {
		const paths = wikiFiles().map((file) => file.path);
		expect(
			paths.filter((path) => path.startsWith("src/wiki/pages/")).length,
		).toBeGreaterThanOrEqual(wikiPages.length);
		expect(paths).toContain("src/wiki/parts/source-link.svelte");
	});

	test("every SourceLink names a file that exists", () => {
		expect(brokenReferences(wikiFiles(), sourceLinks, missingFile)).toEqual([]);
	});

	test("every DocsPointer names a file that exists", () => {
		expect(brokenReferences(wikiFiles(), docsPointers, missingDoc)).toEqual([]);
	});

	test("every link between wiki pages has a page", () => {
		expect(brokenReferences(wikiFiles(), wikiLinks, missingPage)).toEqual([]);
	});

	test("every SourceLink to a line lands on what it names", () => {
		expect(driftedLines(wikiFiles())).toEqual([]);
	});

	describe("the checks find what they should (made-up text)", () => {
		const made = (...lines: string[]) => [{ path: "made-up.md", source: lines.join("\n") }];

		test("a SourceLink to a missing file", () => {
			const files = made(
				'<SourceLink path="package.json" />',
				'text <SourceLink label="x" path="src/lib/nothing-here.ts" />',
			);
			expect(brokenReferences(files, sourceLinks, missingFile)).toEqual([
				"made-up.md:2 → src/lib/nothing-here.ts",
			]);
		});

		test("a tag over several lines, with either quote or a literal in braces", () => {
			const files = made(
				"<SourceLink",
				'\tlabel="a > b"',
				'\tpath="src/lib/multi-line.ts"',
				"/>",
				"<SourceLink path='src/lib/single-quoted.ts' />",
				"<SourceLink path={'src/lib/braced.ts'} />",
				'<SourceLink path={"src/lib/braced-double.ts"} />',
				"<SourceLink path={`src/lib/braced-template.ts`} />",
				"<SourceLink",
				"\tpath={'package.json'}",
				"/>",
			);
			expect(brokenReferences(files, sourceLinks, missingFile)).toEqual([
				"made-up.md:1 → src/lib/multi-line.ts",
				"made-up.md:5 → src/lib/single-quoted.ts",
				"made-up.md:6 → src/lib/braced.ts",
				"made-up.md:7 → src/lib/braced-double.ts",
				"made-up.md:8 → src/lib/braced-template.ts",
			]);
		});

		test("a SourceLink or DocsPointer whose path can't be read is a failure", () => {
			const files = made(
				"<SourceLink />",
				"<SourceLink path={file} />",
				"<SourceLink path={`src/${name}.ts`} />",
				'<SourceLink path="" />',
				"<SourceLink {...props} />",
				"<DocsPointer />",
				"<DocsPointer doc={computed} />",
				"<SourceLink path='package.json'",
			);
			expect(brokenReferences(files, sourceLinks, missingFile)).toEqual([
				"made-up.md:1 → unreadable",
				"made-up.md:2 → unreadable",
				"made-up.md:3 → unreadable",
				"made-up.md:4 → unreadable",
				"made-up.md:5 → unreadable",
				"made-up.md:8 → unreadable",
			]);
			expect(brokenReferences(files, docsPointers, missingDoc)).toEqual([
				"made-up.md:6 → unreadable",
				"made-up.md:7 → unreadable",
			]);
		});

		test("a DocsPointer to a missing file, an anchor ignored", () => {
			const files = made(
				'<DocsPointer doc="docs/agents/kit.md#permissions" />',
				"<DocsPointer",
				"\tdoc='docs/agents/no-such-doc.md#x'",
				"/>",
			);
			expect(brokenReferences(files, docsPointers, missingDoc)).toEqual([
				"made-up.md:2 → docs/agents/no-such-doc.md#x",
			]);
		});

		test("a link to a wiki page that doesn't exist", () => {
			const files = made(
				"[start](/wiki/start/what-fieldworks-is#top) and [index](/wiki)",
				"[gone](/wiki/orders/no-such-page?x=1) and",
				'<a href="/wiki/nowhere">gone</a> <a href="https://example.com/wiki/x">other</a>',
			);
			expect(brokenReferences(files, wikiLinks, missingPage)).toEqual([
				"made-up.md:2 → /wiki/orders/no-such-page?x=1",
				"made-up.md:3 → /wiki/nowhere",
			]);
		});

		test("a SourceLink whose line moved away from what it names", () => {
			const file: Record<string, string[]> = {
				"src/a.ts": ["import x;", "export function moveOrderStock() {", "export const rows = [];"],
			};
			const read = (path: string, n: number) => file[path]?.[n - 1];
			const files = made(
				'<SourceLink path="src/a.ts" line={2}><code>moveOrderStock()</code></SourceLink>',
				'<SourceLink path="src/a.ts" line={2}>moveOrderStock()</SourceLink>',
				'<SourceLink path="src/a.ts" line={1}><code>moveOrderStock()</code></SourceLink>',
				'<SourceLink path="src/a.ts" line={3}>the rows</SourceLink>',
				'<SourceLink path="src/a.ts" line={3} symbol="rows">the rows</SourceLink>',
				'<SourceLink path="src/a.ts" line={2} symbol="rows">the rows</SourceLink>',
				'<SourceLink path="src/a.ts" line={3}>a.ts</SourceLink>',
				'<SourceLink path="src/a.ts" line={9}><code>rows</code></SourceLink>',
				'<SourceLink path="src/a.ts" line={2}><code>shells</code> and <code>moveOrderStock()</code></SourceLink>',
				'<SourceLink path="src/a.ts" line={x}><code>rows</code></SourceLink>',
				'<SourceLink path="src/a.ts" line={3} />',
				'<SourceLink path="src/a.ts" line={2}><code>moveOrder</code></SourceLink>',
				'<SourceLink path="src/a.ts"><code>nowhere</code></SourceLink>',
			);
			expect(driftedLines(files, read)).toEqual([
				"made-up.md:3 → src/a.ts:1 lacks moveOrderStock",
				"made-up.md:4 → src/a.ts:3: names no identifier (add a symbol)",
				"made-up.md:6 → src/a.ts:2 lacks rows",
				"made-up.md:7 → src/a.ts:3: names no identifier (add a symbol)",
				"made-up.md:8 → src/a.ts:9 lacks rows",
				"made-up.md:10 → unreadable",
				"made-up.md:11 → src/a.ts:3: names no identifier (add a symbol)",
				"made-up.md:12 → src/a.ts:2 lacks moveOrder",
			]);
		});

		test("single-quoted, braced and reference-style wiki links", () => {
			const files = made(
				"<a href='/wiki/single'>x</a>",
				"<a href={'/wiki/braced'}>x</a>",
				'<a href={"/wiki/braced-double"}>x</a>',
				"<a href={`/wiki/${slug}`}>x</a>",
				"<a href={base + '/wiki/computed'}>x</a>",
				"<a href='/wiki/start/what-fieldworks-is'>fine</a>",
				"[t]: /wiki/reference-style",
				"  [u]: </wiki/angled#a>",
				"[ok]: /wiki/start/what-fieldworks-is",
				"[outside]: https://example.com/wiki/elsewhere",
			);
			expect(brokenReferences(files, wikiLinks, missingPage)).toEqual([
				"made-up.md:1 → /wiki/single",
				"made-up.md:2 → /wiki/braced",
				"made-up.md:3 → /wiki/braced-double",
				"made-up.md:4 → unreadable",
				"made-up.md:5 → unreadable",
				"made-up.md:7 → /wiki/reference-style",
				"made-up.md:8 → /wiki/angled#a",
			]);
		});
	});
});
