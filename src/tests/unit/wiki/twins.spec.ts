/**
 * The wiki's Dutch twins (docs/plans/wiki-dutch.md): beside each page `src/wiki/pages/<slug>.md`
 * sits `<slug>.nl.md`, the same page in Dutch, which the registry (`#wiki/pages.ts`) serves to a
 * Dutch visitor. This reads every page and twin as text and refuses
 *
 * - a page without its twin, unless `notYetTranslated` lists it; and a page that list names that
 *   has its twin, or that doesn't exist, so the list only shrinks;
 * - a twin without its page;
 * - a twin whose front-matter isn't exactly `title` and `summary` (the build adds `headings`): the
 *   section, order, status and coverage are the page's alone;
 * - a twin that isn't built like its page, so a change to one that isn't made to the other fails:
 *   the same components in the same order, with the same literal `path`, `doc`, `line`, `symbol`
 *   and `as`; the same `<script>` imports; as many `##` headings; and links to the same wiki pages
 *   (`/wiki/…`, an `#anchor` or `?query` ignored: a heading's id is its language's).
 *
 * Failures name the file and what differs. The checks also run on made-up pairs, to show each can
 * fail.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
	attribute,
	hasAttribute,
	lineAttribute,
	slugOf,
	tagAt,
	wikiLinks,
} from "./markup.test-support.ts";

/**
 * The pages whose Dutch twin isn't written yet, by slug. Only ever shrinks: write the twin, then
 * take its page off the list (a listed page with a twin fails).
 */
const notYetTranslated = [
	"across/activity-log",
	"across/bug-reporter",
	"across/dashboard",
	"across/lists",
	"across/live-updates",
	"across/notifications",
	"across/offline",
	"across/themes",
	"domains/customers",
	"domains/engineers",
	"domains/equipment",
	"internals/cloudflare",
	"internals/extension-points",
	"internals/gates",
	"internals/permissions",
	"internals/tenancy",
	"internals/tests-and-guards",
	"orders/awaiting-acceptance",
	"orders/lifecycle",
	"orders/order-types",
	"orders/service-report",
	"orders/work-record",
	"start/roles-and-shells",
	"start/try-the-demo",
];

const pagesDir = join(import.meta.dirname, "../../../wiki/pages");
const twinSuffix = ".nl.md";

/** A page or a twin: its slug, its path from the project root and its text. */
interface WikiFile {
	slug: string;
	path: string;
	source: string;
}

function wikiFiles() {
	const all = globSync("**/*.md", { cwd: pagesDir })
		.map((file) => file.split("\\").join("/"))
		.sort();
	const read = (file: string, suffix: string): WikiFile => ({
		slug: file.slice(0, -suffix.length),
		path: `src/wiki/pages/${file}`,
		source: readFileSync(join(pagesDir, file), "utf8"),
	});
	return {
		pages: all.filter((file) => !file.endsWith(twinSuffix)).map((file) => read(file, ".md")),
		twins: all.filter((file) => file.endsWith(twinSuffix)).map((file) => read(file, twinSuffix)),
	};
}

/** What's wrong with the pairs: pages without a twin the list doesn't excuse, the list's stale entries, twins without a page. */
function unpaired(pages: string[], twins: string[], excused: readonly string[]): string[] {
	return [
		...pages
			.filter((slug) => !twins.includes(slug) && !excused.includes(slug))
			.map(
				(slug) => `${slug}: no twin (write ${slug}${twinSuffix}, or list it in notYetTranslated)`,
			),
		...excused
			.filter((slug) => twins.includes(slug))
			.map((slug) => `${slug}: has its twin, take it off notYetTranslated`),
		...excused
			.filter((slug) => !pages.includes(slug))
			.map((slug) => `${slug}: in notYetTranslated, but no such page`),
		...twins
			.filter((slug) => !pages.includes(slug))
			.map((slug) => `${slug}${twinSuffix}: a twin without its page ${slug}.md`),
	];
}

/** A page's front-matter (between its `---` lines) and the rest, its body. */
function split(source: string): { frontMatter: string | null; body: string } {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
	return match
		? { frontMatter: match[1], body: source.slice(match[0].length) }
		: { frontMatter: null, body: source };
}

/** What's wrong with a twin's front-matter: it's `title` and `summary`, each with a value, and nothing else. */
function frontMatterProblems(source: string): string[] {
	const { frontMatter } = split(source);
	if (frontMatter === null) return ["no front-matter"];
	const fields = new Map(
		[...frontMatter.matchAll(/^([\w-]+)\s*:(.*)$/gm)].map(([, key, value]) => [key, value.trim()]),
	);
	return [
		...["title", "summary"].filter((key) => !fields.get(key)).map((key) => `no ${key}`),
		...[...fields.keys()]
			.filter((key) => key !== "title" && key !== "summary")
			.map((key) => `${key} is the page's alone`),
	];
}

/** The attributes a component's place in the page is known by: what they link to, or who it signs in as. */
const fixedAttributes = ["path", "doc", "line", "symbol", "as"] as const;

/** A page's build, as the twins must share it. */
interface Structure {
	/** Each component tag in order, with its fixed attributes: `SourceLink path=… line=28`. */
	components: string[];
	/** The `<script>` blocks' imports, each on one line, sorted. */
	imports: string[];
	/** How many `##` headings (outside code blocks). */
	headings: number;
	/** The wiki pages it links to (`/wiki/<slug>`), each once, sorted. */
	links: string[];
}

function structureOf(source: string): Structure {
	const { body } = split(source);
	const scripts = [...body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
		([, code]) => code,
	);
	const markup = body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");

	const components = [...markup.matchAll(/<([A-Z][\w.]*)(?![\w.-])/g)].map((match) => {
		const tag = tagAt(markup, match.index) ?? match[0];
		const fixed = fixedAttributes.flatMap((name) => {
			if (!hasAttribute(tag, name)) return [];
			const value = name === "line" ? lineAttribute(tag) : attribute(tag, name);
			return [`${name}=${value ?? "?"}`];
		});
		return [match[1], ...fixed].join(" ");
	});

	const imports = scripts
		.flatMap((code) => [...code.matchAll(/^\s*import\b[^;]*?(?:from\s*)?["'][^"']+["'];?/gm)])
		.map(([statement]) => statement.replace(/\s+/g, " ").trim().replace(/;$/, ""))
		.sort();

	let fenced = false;
	let headings = 0;
	for (const line of markup.split("\n")) {
		if (/^\s*(?:```|~~~)/.test(line)) fenced = !fenced;
		else if (!fenced && /^##\s/.test(line)) headings++;
	}

	const links = [
		...new Set(
			wikiLinks(markup).map(({ target }) =>
				target === null ? "unreadable" : `/wiki/${slugOf(target)}`.replace(/\/$/, ""),
			),
		),
	].sort();

	return { components, imports, headings, links };
}

/** How `twin` isn't built like `page`: a line per part that differs. */
function differences(page: string, twin: string): string[] {
	const a = structureOf(page);
	const b = structureOf(twin);
	const list = (items: readonly string[]) => (items.length ? items.join(", ") : "none");
	const problems: string[] = [];
	if (a.components.join("\n") !== b.components.join("\n")) {
		problems.push(`components: page has [${list(a.components)}], twin has [${list(b.components)}]`);
	}
	if (a.imports.join("\n") !== b.imports.join("\n")) {
		problems.push(`imports: page has [${list(a.imports)}], twin has [${list(b.imports)}]`);
	}
	if (a.headings !== b.headings) {
		problems.push(`## headings: page has ${a.headings}, twin has ${b.headings}`);
	}
	if (a.links.join("\n") !== b.links.join("\n")) {
		problems.push(`wiki links: page has [${list(a.links)}], twin has [${list(b.links)}]`);
	}
	return problems;
}

describe("the wiki's Dutch twins", () => {
	const { pages, twins } = wikiFiles();

	test("reads the pages and the twins", () => {
		expect(pages.length).toBeGreaterThan(0);
		expect(twins.map((twin) => twin.slug)).toContain("start/what-fieldworks-is");
	});

	test("every page has its twin, but those not translated yet; every twin has its page", () => {
		expect(
			unpaired(
				pages.map((page) => page.slug),
				twins.map((twin) => twin.slug),
				notYetTranslated,
			),
		).toEqual([]);
	});

	test("a twin's front-matter is its title and summary, nothing else", () => {
		expect(
			twins.flatMap((twin) =>
				frontMatterProblems(twin.source).map((problem) => `${twin.path}: ${problem}`),
			),
		).toEqual([]);
	});

	test("a twin is built like its page", () => {
		expect(
			twins.flatMap((twin) => {
				const page = pages.find((candidate) => candidate.slug === twin.slug);
				if (!page) return [];
				return differences(page.source, twin.source).map((problem) => `${twin.path}: ${problem}`);
			}),
		).toEqual([]);
	});

	describe("the checks find what they should (made-up pairs)", () => {
		test("a page without a twin, a stale entry on the list, a twin without a page", () => {
			expect(unpaired(["a/one", "a/two"], ["a/one"], [])).toEqual([
				"a/two: no twin (write a/two.nl.md, or list it in notYetTranslated)",
			]);
			expect(unpaired(["a/one", "a/two"], ["a/one"], ["a/two"])).toEqual([]);
			expect(unpaired(["a/one"], ["a/one"], ["a/one", "a/gone"])).toEqual([
				"a/one: has its twin, take it off notYetTranslated",
				"a/gone: in notYetTranslated, but no such page",
			]);
			expect(unpaired(["a/one"], ["a/one", "a/lost"], [])).toEqual([
				"a/lost.nl.md: a twin without its page a/lost.md",
			]);
		});

		test("a twin's front-matter with more than its title and summary, or less", () => {
			expect(frontMatterProblems("---\ntitle: Een\nsummary: Wat.\n---\n\nTekst.")).toEqual([]);
			expect(
				frontMatterProblems("---\ntitle: Een\nsummary: Wat.\nsection: start\norder: 1\n---\n"),
			).toEqual(["section is the page's alone", "order is the page's alone"]);
			expect(frontMatterProblems("---\ntitle: Een\nsummary:\n---\n")).toEqual(["no summary"]);
			expect(frontMatterProblems("Tekst.")).toEqual(["no front-matter"]);
		});

		/** A page of `lines`, with front-matter. */
		const made = (...lines: string[]) => ["---", "title: T", "---", "", ...lines].join("\n");

		test("a pair built alike passes, whatever its prose and labels say", () => {
			const page = made(
				"<script>",
				'\timport SourceLink from "#wiki/parts/source-link.svelte";',
				'\timport TryIt from "#wiki/parts/try-it.svelte";',
				"</script>",
				"",
				"Text with [a link](/wiki/orders/lifecycle#try-the-moves).",
				"",
				"## A heading",
				"",
				'<SourceLink path="src/a.ts" line={2} symbol="x">the label</SourceLink> <TryIt as="planner" />',
			);
			const twin = made(
				"<script>",
				'\timport TryIt from "#wiki/parts/try-it.svelte";',
				'\timport SourceLink from "#wiki/parts/source-link.svelte";',
				"</script>",
				"",
				"Tekst met [een link](/wiki/orders/lifecycle#probeer-de-stappen).",
				"",
				"## Een kop",
				"",
				"```md",
				"## Not a heading: in a code block",
				"```",
				"",
				"<SourceLink",
				'\tpath="src/a.ts"',
				"\tline={2}",
				"\tsymbol='x'>het label</SourceLink> <TryIt as={'planner'} />",
			);
			expect(differences(page, twin)).toEqual([]);
		});

		test("a component missing, added, out of order, or with another path, line, symbol, doc or as", () => {
			const page = made('<HowItWorks />\n\n<SourceLink path="src/a.ts" line={2}>x</SourceLink>');
			const differ = (twin: string) => differences(page, made(twin));
			expect(differ('<SourceLink path="src/a.ts" line={2}>x</SourceLink>')).toEqual([
				"components: page has [HowItWorks, SourceLink path=src/a.ts line=2], twin has [SourceLink path=src/a.ts line=2]",
			]);
			expect(
				differ('<SourceLink path="src/a.ts" line={2}>x</SourceLink>\n\n<HowItWorks />'),
			).toHaveLength(1);
			expect(
				differ('<HowItWorks />\n\n<SourceLink path="src/b.ts" line={2}>x</SourceLink>'),
			).toHaveLength(1);
			expect(
				differ('<HowItWorks />\n\n<SourceLink path="src/a.ts" line={3}>x</SourceLink>'),
			).toHaveLength(1);
			expect(
				differ('<HowItWorks />\n\n<SourceLink path="src/a.ts" line={2} symbol="y">x</SourceLink>'),
			).toHaveLength(1);
			expect(
				differences(
					made('<DocsPointer doc="docs/agents/kit.md" />'),
					made('<DocsPointer doc="docs/agents/i18n.md" />'),
				),
			).toHaveLength(1);
			expect(differences(made('<TryIt as="planner" />'), made('<TryIt as="engineer" />'))).toEqual([
				"components: page has [TryIt as=planner], twin has [TryIt as=engineer]",
			]);
		});

		test("different imports", () => {
			const script = (...imports: string[]) =>
				made("<script>", ...imports.map((line) => `\t${line}`), "</script>");
			expect(
				differences(
					script('import HowItWorks from "#wiki/parts/how-it-works.svelte";'),
					script(
						'import HowItWorks from "#wiki/parts/how-it-works.svelte";',
						'import Diagram from "#wiki/parts/diagram.svelte";',
					),
				),
			).toEqual([
				'imports: page has [import HowItWorks from "#wiki/parts/how-it-works.svelte"], twin has [import Diagram from "#wiki/parts/diagram.svelte", import HowItWorks from "#wiki/parts/how-it-works.svelte"]',
			]);
		});

		test("another number of ## headings", () => {
			expect(differences(made("## One", "", "## Two"), made("## Een", "", "### Twee"))).toEqual([
				"## headings: page has 2, twin has 1",
			]);
		});

		test("links to other wiki pages", () => {
			expect(
				differences(
					made("[a](/wiki/orders/lifecycle) and <a href='/wiki/domains/customers'>b</a>"),
					made("[a](/wiki/orders/lifecycle) en [b](/wiki/domains/equipment)"),
				),
			).toEqual([
				"wiki links: page has [/wiki/domains/customers, /wiki/orders/lifecycle], twin has [/wiki/domains/equipment, /wiki/orders/lifecycle]",
			]);
			// The same page linked twice in one and once in the other is the same set.
			expect(differences(made("[a](/wiki/x) [b](/wiki/x)"), made("[a](/wiki/x)"))).toEqual([]);
		});
	});
});
