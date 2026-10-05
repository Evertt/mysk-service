import { existsSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { modules } from "./modules.ts";

test("module ids are unique", () => {
	const ids = modules.map((module) => module.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test.each(modules)("the $id module's route is a page", ({ route }) => {
	expect(existsSync(new URL(`../routes${route}/+page.svelte`, import.meta.url))).toBe(true);
});
