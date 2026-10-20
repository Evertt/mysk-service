/**
 * Every `@page` rule is named (`@page labels { … }`, used with `page: labels`). A component's CSS
 * stays loaded once its chunk is, so an unnamed `@page` set by one printable page would set the
 * paper and margins of everything printed after it.
 */
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "../../..");

test("@page rules are named, so they apply to their own sheet only", () => {
	const unnamed = globSync("src/**/*.{svelte,css}", { cwd: root }).flatMap((path) =>
		[...readFileSync(join(root, path), "utf8").matchAll(/@page\s*(?::[\w-]+\s*)?\{/g)].map(
			(match) => `${path}: ${match[0]}`,
		),
	);
	expect(unnamed).toEqual([]);
});
