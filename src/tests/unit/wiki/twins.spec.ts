/**
 * The wiki's Dutch twins (docs/plans/wiki-dutch.md): beside each page `src/wiki/pages/<slug>.md`
 * sits `<slug>.nl.md`, the same page in Dutch, which the registry (`#wiki/pages.ts`) serves to a
 * Dutch visitor. This reads every page and twin as text and refuses
 *
 * - a page without its twin, and a twin without its page;
 * - a twin whose front-matter isn't exactly `title` and `summary` (the build adds `headings`): the
 *   section, order, status and coverage are the page's alone;
 * - a twin with no prose, only components and whitespace (a stub);
 * - a twin that isn't built like its page, so a change to one that isn't made to the other fails:
 *   the same components in the same order, with the same literal `path`, `doc`, `section`, `line`,
 *   `symbol` and `as`; the same `<script>` imports; as many `##` headings; and links to the same
 *   wiki pages (`/wiki/…`, an `#anchor` or `?query` ignored: a heading's id is its language's);
 * - a twin that is its page's text copied, not translated: more than half of its prose lines
 *   (code, tags, link targets and addresses left out) also stand in the English page;
 * - a twin whose code differs from its page's: the same inline code spans and the same code blocks
 *   (as multisets, so a sentence may move them), as `messages.spec.ts` does for the messages. A
 *   translator moves code, never changes it.
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

/** What's wrong with the pairs: pages without a twin, twins without a page. */
function unpaired(pages: string[], twins: string[]): string[] {
	return [
		...pages
			.filter((slug) => !twins.includes(slug))
			.map((slug) => `${slug}: no twin (write ${slug}${twinSuffix})`),
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

/**
 * The attributes a component's place in the page is known by: what they link to (a `DocsPointer`'s
 * `section` is a heading of an English doc), or who it signs in as.
 */
const fixedAttributes = ["path", "doc", "section", "line", "symbol", "as"] as const;

/** A body without its scripts, styles and comments. */
function withoutScripts(body: string): string {
	return body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/g, "").replace(/<!--[\s\S]*?-->/g, "");
}

/** A component's or an element's tag, opening or closing, whose attributes may span lines. */
const tagPattern = /<\/?[A-Za-z][\w.]*(?:[^>"'{]|"[^"]*"|'[^']*'|\{[^}]*\})*>/g;

/** What's wrong with a twin's body: nothing but components, scripts and whitespace, so no prose. */
function proseProblems(source: string): string[] {
	const text = withoutScripts(split(source).body).replace(tagPattern, "");
	return /\p{L}/u.test(text) ? [] : ["no prose: only components and whitespace"];
}

/** A body in its code blocks (the opening line, `ts`, and the lines between) and the rest of it. */
function fencesOf(body: string): { blocks: string[]; rest: string } {
	const blocks: string[] = [];
	const rest: string[] = [];
	let open: string[] | null = null;
	for (const line of body.split("\n")) {
		const fence = /^\s*(?:```|~~~)(.*)$/.exec(line);
		if (fence && open === null) open = [fence[1].trim()];
		else if (fence) {
			blocks.push(open!.join("\n"));
			open = null;
		} else if (open) open.push(line.trimEnd());
		else rest.push(line);
	}
	if (open) blocks.push(open.join("\n"));
	return { blocks, rest: rest.join("\n") };
}

/** The prose lines of a page or twin, trimmed: what's left of its body without code, tags, link targets and addresses, of at least three words. */
function proseLines(source: string): string[] {
	return withoutScripts(fencesOf(split(source).body).rest)
		.replace(tagPattern, "")
		.replace(/`[^`]*`/g, "")
		.replace(/\]\([^)]*\)/g, "]")
		.replace(/https?:\/\/\S+/g, "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => (line.match(/\p{L}{2,}/gu) ?? []).length >= 3);
}

/** What's wrong when a twin's prose is its page's: most of its lines are the English ones. */
function copyProblems(page: string, twin: string): string[] {
	const english = new Set(proseLines(page));
	const lines = proseLines(twin);
	const same = lines.filter((line) => english.has(line));
	return same.length > lines.length / 2
		? [
				`copied, not translated: ${same.length} of its ${lines.length} prose lines are in the English page too ("${same[0]}")`,
			]
		: [];
}

/** What's in `a` and not in `b`, counting repeats. */
function without(a: readonly string[], b: readonly string[]): string[] {
	const left = [...b];
	return a.filter((item) => {
		const at = left.indexOf(item);
		if (at === -1) return true;
		left.splice(at, 1);
		return false;
	});
}

/** How the inline code and the code blocks of `twin` differ from `page`'s, as multisets. */
function codeDifferences(page: string, twin: string): string[] {
	const codeOf = (source: string) => {
		const { blocks, rest } = fencesOf(split(source).body);
		const spans = [...withoutScripts(rest).matchAll(/`([^`]+)`/g)].map(([, code]) =>
			code.replace(/\s+/g, " ").trim(),
		);
		return { spans, blocks };
	};
	const a = codeOf(page);
	const b = codeOf(twin);
	const list = (items: string[]) => `[${items.map((item) => `\`${item}\``).join(", ")}]`;
	const problems: string[] = [];

	const onlyInPage = without(a.spans, b.spans);
	const onlyInTwin = without(b.spans, a.spans);
	if (onlyInPage.length || onlyInTwin.length) {
		problems.push(
			`inline code: ${[
				onlyInPage.length ? `only in the page ${list(onlyInPage)}` : "",
				onlyInTwin.length ? `only in the twin ${list(onlyInTwin)}` : "",
			]
				.filter(Boolean)
				.join("; ")}`,
		);
	}

	const blocksOnlyInPage = without(a.blocks, b.blocks);
	const blocksOnlyInTwin = without(b.blocks, a.blocks);
	if (blocksOnlyInPage.length || blocksOnlyInTwin.length) {
		const first = (blocksOnlyInPage[0] ?? blocksOnlyInTwin[0]).replace(/\s+/g, " ").trim();
		problems.push(
			`code blocks: ${blocksOnlyInPage.length} only in the page, ${blocksOnlyInTwin.length} only in the twin (first: ${first})`,
		);
	}
	return problems;
}

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

	test("every page has its twin; every twin has its page", () => {
		expect(
			unpaired(
				pages.map((page) => page.slug),
				twins.map((twin) => twin.slug),
			),
		).toEqual([]);
	});

	test("a twin has prose", () => {
		expect(
			twins.flatMap((twin) =>
				proseProblems(twin.source).map((problem) => `${twin.path}: ${problem}`),
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

	test("a twin is a translation, not a copy of its page", () => {
		expect(
			twins.flatMap((twin) => {
				const page = pages.find((candidate) => candidate.slug === twin.slug);
				if (!page) return [];
				return copyProblems(page.source, twin.source).map((problem) => `${twin.path}: ${problem}`);
			}),
		).toEqual([]);
	});

	test("a twin keeps its page's code: the same inline code and code blocks", () => {
		expect(
			twins.flatMap((twin) => {
				const page = pages.find((candidate) => candidate.slug === twin.slug);
				if (!page) return [];
				return codeDifferences(page.source, twin.source).map(
					(problem) => `${twin.path}: ${problem}`,
				);
			}),
		).toEqual([]);
	});

	describe("the checks find what they should (made-up pairs)", () => {
		test("a page without a twin, a twin without a page", () => {
			expect(unpaired(["a/one"], ["a/one"])).toEqual([]);
			expect(unpaired(["a/one", "a/two"], ["a/one"])).toEqual([
				"a/two: no twin (write a/two.nl.md)",
			]);
			expect(unpaired(["a/one"], ["a/one", "a/lost"])).toEqual([
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

		test("a component missing, added, out of order, or with another path, line, symbol, doc, section or as", () => {
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
			expect(
				differences(
					made('<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />'),
					made('<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />'),
				),
			).toEqual([]);
			expect(
				differences(
					made('<DocsPointer doc="docs/agents/tenancy.md" section="Tenancy" />'),
					made('<DocsPointer doc="docs/agents/tenancy.md" section="Huurders" />'),
				),
			).toEqual([
				"components: page has [DocsPointer doc=docs/agents/tenancy.md section=Tenancy], twin has [DocsPointer doc=docs/agents/tenancy.md section=Huurders]",
			]);
			expect(differences(made('<TryIt as="planner" />'), made('<TryIt as="engineer" />'))).toEqual([
				"components: page has [TryIt as=planner], twin has [TryIt as=engineer]",
			]);
		});

		test("a twin without prose: only components, scripts and whitespace", () => {
			expect(
				proseProblems(made('Tekst met een <SourceLink path="src/a.ts">label</SourceLink>.')),
			).toEqual([]);
			expect(proseProblems(made("## Een kop"))).toEqual([]);
			expect(
				proseProblems(
					made(
						"<script>",
						'\timport HowItWorks from "#wiki/parts/how-it-works.svelte";',
						"</script>",
						"",
						"<HowItWorks />",
						"",
						"<DocsPointer",
						'\tdoc="docs/agents/kit.md"',
						"/>",
						"",
					),
				),
			).toEqual(["no prose: only components and whitespace"]);
			expect(proseProblems(made(""))).toEqual(["no prose: only components and whitespace"]);
		});

		test("a twin that is its page's text copied, or mostly", () => {
			const page = made(
				"A line of the page that says something about tenants and their orders,",
				"and a second line that says something else about the activity log.",
				"",
				"## Try it",
				"",
				"Pick an order of South while you are signed in at North, and turn the scope off.",
				'<SourceLink path="src/a.ts" line={2}>the label of a link</SourceLink> and `code`.',
				"See [the lifecycle](/wiki/orders/lifecycle) or https://example.com/a-long-address now.",
			);
			// A copy of the page, whatever its front-matter says.
			expect(copyProblems(page, page.replace("title: T", "title: Titel"))).toHaveLength(1);
			// A copy with one line translated is still a copy.
			expect(
				copyProblems(
					page,
					page.replace(
						"and a second line that says something else",
						"en een tweede regel over iets",
					),
				),
			).toHaveLength(1);
			// A twin in Dutch: nothing is the same but what is code, a tag or an address.
			expect(
				copyProblems(
					page,
					made(
						"Een regel van de pagina die iets zegt over tenants en hun opdrachten,",
						"en een tweede regel die iets anders zegt over het activiteitenlogboek.",
						"",
						"## Probeer het",
						"",
						"Kies een opdracht van South terwijl je bij North bent ingelogd, en zet de begrenzing uit.",
						'<SourceLink path="src/a.ts" line={2}>het label van een link</SourceLink> en `code`.',
						"Zie [de levenscyclus](/wiki/orders/lifecycle) of https://example.com/a-long-address nu.",
					),
				),
			).toEqual([]);
			// A twin that only shares what isn't prose: code, fences, tags, comments and addresses.
			expect(
				copyProblems(
					made("Code: `one two three four` and a link https://example.com/one/two/three/four."),
					made("Code: `one two three four` en een link https://example.com/one/two/three/four."),
				),
			).toEqual([]);
		});

		test("a twin whose inline code or code blocks differ from its page's", () => {
			const page = made(
				"Call `inTenant(table)` first, then `recordActivity(tx)`, and `inTenant(table)` again.",
				"",
				"```ts",
				"const x = inTenant(orders);",
				"```",
			);
			const twin = (...lines: string[]) => made(...lines);
			// The same code, moved around the Dutch sentence and the block's place.
			expect(
				codeDifferences(
					page,
					twin(
						"Roep eerst `recordActivity(tx)` aan, `inTenant(table)` en nog eens `inTenant(table)`.",
						"",
						"```ts",
						"const x = inTenant(orders);",
						"```",
					),
				),
			).toEqual([]);
			// An inline span translated, one missing, one added.
			expect(
				codeDifferences(
					page,
					twin(
						"Roep `inTenant(tabel)` aan, dan `recordActivity(tx)`, en `inTenant(table)`.",
						"",
						"```ts",
						"const x = inTenant(orders);",
						"```",
					),
				),
			).toEqual([
				"inline code: only in the page [`inTenant(table)`]; only in the twin [`inTenant(tabel)`]",
			]);
			expect(
				codeDifferences(
					page,
					twin(
						"Roep `inTenant(table)` aan, dan `recordActivity(tx)`, `inTenant(table)` en `extra()`.",
						"",
						"```ts",
						"const x = inTenant(orders);",
						"```",
					),
				),
			).toEqual(["inline code: only in the twin [`extra()`]"]);
			// A fence changed, or gone.
			expect(
				codeDifferences(
					page,
					twin(
						"Roep `inTenant(table)` aan, dan `recordActivity(tx)`, en `inTenant(table)`.",
						"",
						"```ts",
						"const x = inTenant(opdrachten);",
						"```",
					),
				),
			).toEqual([
				"code blocks: 1 only in the page, 1 only in the twin (first: ts const x = inTenant(orders);)",
			]);
			expect(
				codeDifferences(
					page,
					twin("Roep `inTenant(table)` aan, dan `recordActivity(tx)`, en `inTenant(table)`."),
				),
			).toEqual([
				"code blocks: 1 only in the page, 0 only in the twin (first: ts const x = inTenant(orders);)",
			]);
			// Backticks in a script or a comment, or inside a block, aren't inline code.
			expect(
				codeDifferences(
					made(
						"<script>",
						"\tconst a = `x`;",
						"</script>",
						"",
						"<!-- `note` -->",
						"",
						"```md",
						"`in a block`",
						"```",
					),
					made(
						"<script>",
						"\tconst a = `y`;",
						"</script>",
						"",
						"<!-- `nota` -->",
						"",
						"```md",
						"`in a block`",
						"```",
					),
				),
			).toEqual([]);
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
