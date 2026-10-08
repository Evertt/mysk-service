import { existsSync, readdirSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { generatedModuleIds } from "./module-ids.gen.ts";
import { moduleIds } from "./module-ids.ts";
import { manifests } from "./modules.gen.ts";
import { modules, type SlotName, slotLoaders } from "./modules.ts";

test("the registry has the modules of the plain list of ids, in order", () => {
	expect(modules.map((module) => module.id)).toEqual([...moduleIds]);
});

test("the folders in src/modules with a module.ts have their manifest in the registry, by id", () => {
	const dir = new URL("../modules/", import.meta.url);
	const folders = existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter(
					(entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/module.ts`, dir)),
				)
				.map((entry) => entry.name)
				.toSorted()
		: [];
	// If this fails, run `pnpm generate`.
	expect((manifests as readonly { id: string }[]).map((manifest) => manifest.id)).toEqual(folders);
	expect([...generatedModuleIds]).toEqual(folders);
});

test("module ids are unique", () => {
	const ids = modules.map((module) => module.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test.each(modules)("the $id module's route is a page", ({ route }) => {
	expect(existsSync(new URL(`../routes${route}/+page.svelte`, import.meta.url))).toBe(true);
});

describe("slotLoaders", () => {
	const slots: SlotName[] = ["dashboard", "order", "equipment"];

	test.each(slots)(
		"gives the %s slot the contracts module's component when it's enabled",
		(name) => {
			expect(slotLoaders(name, ["contracts"])).toEqual([modules[0].slots[name]]);
		},
	);

	test.each(slots)("leaves the %s slot empty without modules", (name) => {
		expect(slotLoaders(name, [])).toEqual([]);
	});

	test("gives the components of several modules in registry order", () => {
		const [contracts, invoicing] = modules;
		expect(slotLoaders("dashboard", ["invoicing", "contracts"])).toEqual([
			contracts.slots.dashboard,
			invoicing.slots.dashboard,
		]);
		expect(slotLoaders("order", ["invoicing"])).toEqual([invoicing.slots.order]);
		expect(slotLoaders("equipment", ["invoicing"])).toEqual([]);
	});

	test("ignores modules that don't exist", () => {
		expect(slotLoaders("order", ["no-such-module"])).toEqual([]);
	});
});
