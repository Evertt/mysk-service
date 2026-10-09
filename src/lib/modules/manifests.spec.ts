import { existsSync, readdirSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { gadgets, widgets } from "./fakes.ts";
import { generatedModuleIds } from "./ids.gen.ts";
import { moduleIds } from "./ids.ts";
import { manifests } from "./manifests.gen.ts";
import { bulkActionLoaders, modules, type SlotName, slotLoaders } from "./manifests.ts";

test("the registry has the modules of the plain list of ids, in order", () => {
	expect(modules.map((module) => module.id)).toEqual([...moduleIds]);
});

test("the folders in src/modules with a module.ts have their manifest in the registry, by id", () => {
	const dir = new URL("../../modules/", import.meta.url);
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
	expect(existsSync(new URL(`../../routes${route}/+page.svelte`, import.meta.url))).toBe(true);
});

describe("slotLoaders", () => {
	const registry = [gadgets, widgets];
	const slots: SlotName[] = ["dashboard", "order", "equipment"];

	test.each(slots)("leaves the %s slot empty without modules", (name) => {
		expect(slotLoaders(name, [], registry)).toEqual([]);
	});

	test("gives a module's component only when it's enabled", () => {
		expect(slotLoaders("order", ["widgets"], registry)).toEqual([widgets.slots.order]);
		expect(slotLoaders("equipment", ["gadgets"], registry)).toEqual([gadgets.slots.equipment]);
		expect(slotLoaders("equipment", ["widgets"], registry)).toEqual([]);
	});

	test("gives the components of several modules in registry order", () => {
		expect(slotLoaders("dashboard", ["widgets", "gadgets"], registry)).toEqual([
			gadgets.slots.dashboard,
			widgets.slots.dashboard,
		]);
	});

	test("ignores modules that don't exist", () => {
		expect(slotLoaders("order", ["no-such-module"], registry)).toEqual([]);
	});
});

describe("bulkActionLoaders", () => {
	const registry = [gadgets, widgets];

	test("gives the bulk actions of the enabled modules that have any", () => {
		expect(bulkActionLoaders("orders", ["gadgets", "widgets"], registry)).toEqual([
			widgets.bulkActions.orders,
		]);
		expect(bulkActionLoaders("orders", ["gadgets"], registry)).toEqual([]);
		expect(bulkActionLoaders("orders", [], registry)).toEqual([]);
	});
});
