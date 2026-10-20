/**
 * One way to load what the modules contribute to a point by file (a slot's components, a table's
 * bulk actions, a list's columns): `loadContributions(registry, point, modules)` in
 * `#lib/extensions/define.ts`, awaited in a `$derived`. It picks the point's contributions of the
 * tenant's modules, in registry order, loads them, and never rejects: a chunk that fails is logged
 * and comes with its error. So code that reads a registry of `contributions.gen.ts` hands it to
 * `loadContributions()`, never filters it and calls `load()` itself.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

/** The lines of `source` that load a contribution by hand: a registry's `load()` or a filter on its `point`. */
function handLoads(source: string) {
	if (!/contributions\.gen\.ts["']/.test(source)) return [];
	return source
		.split("\n")
		.flatMap((line, index) =>
			/\.point\s*===|\(\s*load\s+as\b|\bload\(\)/.test(line) ? [index + 1] : [],
		);
}

test("contributions are loaded with loadContributions()", () => {
	const found = readdirSync(join(root, "src"), { recursive: true, encoding: "utf8" })
		.map((file) => `src/${file}`)
		.filter(
			(file) =>
				/\.(?:svelte|ts)$/.test(file) &&
				!file.endsWith(".gen.ts") &&
				// Specs mock the registry with made-up contributions.
				!/(^|\/)tests\//.test(file),
		)
		.flatMap((file) =>
			handLoads(readFileSync(join(root, file), "utf8")).map(
				(line) => `${file}:${line}: load it with loadContributions() (#lib/extensions/define.ts)`,
			),
		);
	expect(found).toEqual([]);
});

test("finds a registry filtered and loaded by hand", () => {
	const header = `import { slotContributions } from "#lib/extensions/contributions.gen.ts";\n`;
	expect(handLoads(`${header}slotContributions.filter((e) => e.point === point.id)`)).toEqual([2]);
	expect(handLoads(`${header}await (load as X)()`)).toEqual([2]);
	expect(handLoads(`${header}loadContributions(slotContributions, point, modules)`)).toEqual([]);
	expect(handLoads(`entries.filter((e) => e.point === id)`)).toEqual([]);
});
