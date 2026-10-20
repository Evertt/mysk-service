import { existsSync, readdirSync } from "node:fs";

import { expect, test } from "vite-plus/test";

import { slotContributions } from "#lib/extensions/contributions.gen.ts";
import { generatedModuleIds } from "#lib/modules/ids.gen.ts";
import { moduleGraph, moduleIds } from "#lib/modules/ids.ts";
import { manifests } from "#lib/modules/manifests.gen.ts";
import { type AppModule, modulePages, modules } from "#lib/modules/manifests.ts";

test("the registry has the modules of the plain list of ids, in order", () => {
	expect(modules.map((module) => module.id)).toEqual([...moduleIds]);
});

test("the folders in src/modules with a module.ts have their manifest in the registry, by id", () => {
	const dir = new URL("../../../../modules/", import.meta.url);
	const folders = existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter(
					(entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/module.ts`, dir)),
				)
				.map((entry) => entry.name)
				.toSorted()
		: [];
	// If this fails, run `pnpm generate`. The registries are in dependency order, not the folders'.
	const sorted = (ids: readonly string[]) => [...ids].toSorted();
	expect(sorted((manifests as readonly { id: string }[]).map((manifest) => manifest.id))).toEqual(
		folders,
	);
	expect(sorted(generatedModuleIds)).toEqual(folders);
});

test("every module comes after the modules it requires", () => {
	const ids: readonly string[] = moduleIds;
	const misplaced = moduleIds.flatMap((id) =>
		moduleGraph[id].requires
			.filter((required) => ids.indexOf(required) > ids.indexOf(id))
			.map((required) => `${id} comes before ${required}`),
	);
	expect(misplaced).toEqual([]);
});

test("the graph of ids is what the manifests declare", () => {
	// Through the wide type: the real manifests' narrow types lack the keys they don't declare.
	for (const manifest of modules as readonly AppModule[]) {
		expect(moduleGraph[manifest.id]).toEqual({
			requires: manifest.requires ?? [],
			enhances: manifest.enhances ?? [],
			alwaysOn: manifest.alwaysOn ?? false,
			navAfter: manifest.nav?.after ?? null,
		});
	}
});

test("module ids are unique", () => {
	const ids = modules.map((module) => module.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test.each(modules)("the $id module's pages are pages, and its portal entry has one", ({ id }) => {
	const pages = Object.values(modulePages[id]);
	for (const route of pages) {
		expect(existsSync(new URL(`../../../../routes${route}/+page.svelte`, import.meta.url))).toBe(
			true,
		);
	}
	const manifest: AppModule = modules.find((module) => module.id === id)!;
	expect(Boolean(manifest.portal)).toBe(Boolean(modulePages[id].portal));
});

test("the modules' contributions are in registry order", () => {
	const ids: readonly string[] = moduleIds;
	const order = slotContributions.map(({ module }) => ids.indexOf(module));
	expect(order).toEqual(order.toSorted((a, b) => a - b));
	expect(order).not.toContain(-1);
});
