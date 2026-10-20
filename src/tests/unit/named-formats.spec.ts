/**
 * One way to format a recurring shape: the named formats in `#lib/i18n/format.ts` (`formatDate`,
 * `formatShortDay`, `formatLongDay`, `formatMonth`, `formatWholeEuros`, `formatPercent`, …). A
 * `dateFormatter({…})` or `numberFormatter({…})` elsewhere whose options are those of a named
 * format is a copy of it, so it's refused; other shapes stay where they're used.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");
const formatFile = "src/lib/i18n/format.ts";

/** A formatter made with literal options, e.g. `dateFormatter({ month: "long" })`. */
const formatter = /\b(dateFormatter|numberFormatter)\(\s*\{([^{}]*)\}\s*\)/g;

/** The options as a key that doesn't depend on their order or layout. */
const optionsKey = (kind: string, options: string) =>
	`${kind}:${[...options.matchAll(/(\w+):\s*("[^"]*"|[\w.]+)/g)]
		.map(([, key, value]) => `${key}=${value}`)
		.toSorted()
		.join(",")}`;

/** The named formats, by their options: `const formatMonth = dateFormatter({ … })`. */
const named = new Map<string, string>();
const formatSource = readFileSync(join(root, formatFile), "utf8");
for (const [, name, kind, options] of formatSource.matchAll(
	/const (\w+) = (dateFormatter|numberFormatter)\(\s*\{([^{}]*)\}\s*\)/g,
)) {
	named.set(optionsKey(kind, options), name);
}

const files = globSync("src/**/*.{svelte,ts}", { cwd: root }).filter(
	(path) =>
		path !== formatFile &&
		!path.startsWith("src/tests/") &&
		!path.includes("/tests/") &&
		!/\.(?:spec|test)\.ts$/.test(path),
);

test("the named formats are found", () => {
	expect([...named.values()]).toEqual(
		expect.arrayContaining(["formatDate", "formatShortDay", "formatLongDay", "formatMonth"]),
	);
});

test("a format with a name in #lib/i18n/format.ts isn't made again", () => {
	const offences: string[] = [];
	for (const path of files) {
		const source = readFileSync(join(root, path), "utf8");
		for (const { 1: kind, 2: options, index } of source.matchAll(formatter)) {
			const name = named.get(optionsKey(kind, options));
			if (!name) continue;
			offences.push(`${path}:${source.slice(0, index).split("\n").length} repeats ${name}`);
		}
	}
	expect(offences, "use the named format from #lib/i18n/format.ts (see AGENTS.md)").toEqual([]);
});
