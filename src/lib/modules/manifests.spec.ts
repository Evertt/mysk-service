import { existsSync, readdirSync } from "node:fs";

import { describe, expect, test } from "vite-plus/test";

import { slotContributions } from "#lib/extensions/contributions.gen.ts";

import { fakeBulkContributions, fakeSlotContributions } from "./fakes.ts";
import { generatedModuleIds } from "./ids.gen.ts";
import { moduleGraph, moduleIds } from "./ids.ts";
import { manifests } from "./manifests.gen.ts";
import {
	type AppModule,
	bulkActionLoaders,
	modules,
	type SlotName,
	slotLoaders,
} from "./manifests.ts";

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
		});
	}
});

test("module ids are unique", () => {
	const ids = modules.map((module) => module.id);
	expect(new Set(ids).size).toBe(ids.length);
});

test.each(modules)("the $id module's route is a page", ({ route }) => {
	expect(existsSync(new URL(`../../routes${route}/+page.svelte`, import.meta.url))).toBe(true);
});

test("the modules' contributions are in registry order", () => {
	const ids: readonly string[] = moduleIds;
	const order = slotContributions.map(({ module }) => ids.indexOf(module));
	expect(order).toEqual(order.toSorted((a, b) => a - b));
	expect(order).not.toContain(-1);
});

// Temporary, removed with ExtensionSlot.
describe("slotLoaders", () => {
	const registry = fakeSlotContributions;
	const [gadgetsDashboard, gadgetsEquipment, widgetsDashboard, widgetsOrder] = registry;
	const slots: SlotName[] = ["dashboard", "order", "equipment"];

	test.each(slots)("leaves the %s slot empty without modules", (name) => {
		expect(slotLoaders(name, [], registry)).toEqual([]);
	});

	test("gives a module's component only when it's enabled", () => {
		expect(slotLoaders("order", ["widgets"], registry)).toEqual([
			{ id: "widgets", load: widgetsOrder.load },
		]);
		expect(slotLoaders("equipment", ["gadgets"], registry)).toEqual([
			{ id: "gadgets", load: gadgetsEquipment.load },
		]);
		expect(slotLoaders("equipment", ["widgets"], registry)).toEqual([]);
	});

	test("gives the components of several modules in registry order", () => {
		expect(slotLoaders("dashboard", ["widgets", "gadgets"], registry)).toEqual([
			{ id: "gadgets", load: gadgetsDashboard.load },
			{ id: "widgets", load: widgetsDashboard.load },
		]);
	});

	test("ignores modules that don't exist", () => {
		expect(slotLoaders("order", ["no-such-module"], registry)).toEqual([]);
	});
});

// Temporary, removed with ExtensionSlot.
describe("bulkActionLoaders", () => {
	const registry = fakeBulkContributions;

	test("gives the bulk actions of the enabled modules that have any", () => {
		expect(bulkActionLoaders("orders", ["gadgets", "widgets"], registry)).toEqual([
			registry[0].load,
		]);
		expect(bulkActionLoaders("orders", ["gadgets"], registry)).toEqual([]);
		expect(bulkActionLoaders("orders", [], registry)).toEqual([]);
	});
});
