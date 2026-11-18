/**
 * Each page of the portals has one `<h1>`: in the customer portal its app bar's (`AppBar`), in the
 * engineer portal the page's own. A component the page renders that titles itself with an `<h1>`
 * (`PageBanner`, a work order, a site's report) is told `heading="h2"` under a page that has one.
 *
 * Read from the sources, a level deep: the page's own `<h1>`s, its `AppBar`, and each component it
 * imports (directly or through a barrel's `export { default as … }`) whose markup has an `<h1>` or
 * a `heading` that is `"h1"` by default, unless it's rendered with `heading="h2"`. Run on made-up
 * pages too, to show it counts what it should.
 */
import { existsSync, globSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The pages of both portals (the modules' customer pages by their source, not the generated route). */
const pageGlobs = [
	"src/routes/(customer)/portal/**/+page.svelte",
	"src/routes/(customer)/+error.svelte",
	"src/modules/*/routes/(customer)/**/+page.svelte",
	"src/routes/(field)/my/**/+page.svelte",
	// Not the engineer portal's error page: it has no app bar, and `ErrorView`'s title is no heading.
];

const aliases: [string, string][] = [
	["#lib/", "src/lib/"],
	["#modules/", "src/modules/"],
	["#routes/", "src/routes/"],
];

/** The project path an import names from `from` (a project path), if it's one of ours. */
function resolved(from: string, specifier: string): string | undefined {
	const alias = aliases.find(([prefix]) => specifier.startsWith(prefix));
	if (alias) return alias[1] + specifier.slice(alias[0].length);
	if (specifier.startsWith(".")) return posix.normalize(posix.join(posix.dirname(from), specifier));
	return undefined;
}

const read = (path: string) =>
	existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "";

/** The markup without comments. */
const markup = (source: string) => source.replace(/<!--[\s\S]*?-->/g, "");

/** Whether a component titles itself with an `<h1>`: literally, or by a `heading` of `"h1"`. */
const titlesItself = (source: string) =>
	/<h1[\s>]/.test(markup(source)) || /\bheading\s*=\s*"h1"/.test(source);

/** The components `source` (at `path`) imports, by their local name: their project paths. */
function componentsOf(path: string, source: string): Map<string, string> {
	const found = new Map<string, string>();
	for (const [, name, specifier] of source.matchAll(/import\s+(\w+)\s+from\s+"([^"]+\.svelte)"/g)) {
		const target = resolved(path, specifier);
		if (target) found.set(name, target);
	}
	for (const [, names, specifier] of source.matchAll(
		/import\s*\{([^}]+)\}\s*from\s*"([^"]+\.ts)"/g,
	)) {
		const barrel = resolved(path, specifier);
		if (!barrel) continue;
		const exports = read(barrel);
		for (const raw of names.split(",")) {
			const name = raw.trim().split(/\s+as\s+/)[0];
			const [, file] =
				exports.match(
					new RegExp(`export\\s*\\{\\s*default as ${name}\\s*\\}\\s*from\\s*"([^"]+)"`),
				) ?? [];
			const target = file && resolved(barrel, file);
			if (target) found.set(name, target);
		}
	}
	return found;
}

/** The `<h1>`s a page renders, as `what` each is, read with `componentAt` for its components. */
export function headingsOf(
	path: string,
	source: string,
	componentAt: (path: string) => string = read,
): string[] {
	const page = markup(source);
	const found: string[] = [...page.matchAll(/<h1[\s>]/g)].map(() => "<h1>");
	for (const [name, target] of componentsOf(path, source)) {
		const isAppBar = target.endsWith("/app-bar.svelte");
		if (!isAppBar && !titlesItself(componentAt(target))) continue;
		for (const usage of page.matchAll(new RegExp(`<${name}\\b`, "g"))) {
			const rest = page.slice(usage.index);
			const tag = rest.slice(0, rest.search(/(?<!=)>/) + 1);
			if (!isAppBar && /\bheading="h2"/.test(tag)) continue;
			found.push(name);
		}
	}
	return found;
}

describe("the portals' pages", () => {
	const pages = pageGlobs.flatMap((pattern) => globSync(pattern, { cwd: root }));

	test("are found", () => {
		expect(pages.length).toBeGreaterThan(15);
	});

	test("each have one <h1>", () => {
		const wrong = pages
			.map((path) => ({ path, headings: headingsOf(path, read(path)) }))
			.filter(({ headings }) => headings.length !== 1)
			.map(({ path, headings }) => `${path}: ${headings.join(", ") || "none"}`);
		expect(wrong).toEqual([]);
	});
});

describe("headingsOf", () => {
	const components: Record<string, string> = {
		"src/lib/client/app-bar.svelte": `<header><h1>{title}</h1></header>`,
		"src/lib/components/page-banner.svelte": `<script>let { heading = "h1" } = $props();</script>`,
		"src/lib/components/card.svelte": `<div><h2>{title}</h2></div>`,
		"src/lib/customers/sites/site-report.svelte": `<h1>Report</h1>`,
		"src/lib/customers/components.ts": `export { default as SiteReport } from "./sites/site-report.svelte";`,
	};
	const at = (path: string) => components[path] ?? "";
	const page = (body: string) =>
		`<script>
	import AppBar from "#lib/client/app-bar.svelte";
	import PageBanner from "#lib/components/page-banner.svelte";
	import Card from "#lib/components/card.svelte";
	import { SiteReport } from "#lib/customers/components.ts";
</script>
${body}`;
	const path = "src/routes/(customer)/portal/x/+page.svelte";
	const count = (body: string) => headingsOf(path, page(body), at);

	test("counts the app bar, the page's own and a component's that titles itself", () => {
		expect(count(`<AppBar title="x" />`)).toEqual(["AppBar"]);
		expect(count(`<AppBar title="x" /><h1>More</h1>`)).toEqual(["<h1>", "AppBar"]);
		expect(count(`<AppBar title="x" />\n<PageBanner\n\ttitle="y"\n/>`)).toEqual([
			"AppBar",
			"PageBanner",
		]);
		// Through a barrel.
		expect(count(`<AppBar title="x" /><SiteReport {report}></SiteReport>`)).toEqual([
			"AppBar",
			"SiteReport",
		]);
	});

	test('not a component told heading="h2", one without an <h1>, nor a comment', () => {
		expect(
			count(
				`<AppBar title="x" />\n<PageBanner\n\theading="h2"\n\tonclick={() => go()}\n/><Card /><!-- <h1> -->`,
			),
		).toEqual(["AppBar"]);
	});
});
