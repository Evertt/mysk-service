import { expect, test } from "vite-plus/test";

import { fakeGraph } from "./fakes.ts";
import { dependentsOf, effectiveModules, requirementsOf } from "./graph.ts";
import type { ModuleId } from "./ids.ts";

// The fake graph's ids aren't the real modules'.
const id = (value: string) => value as ModuleId;

test("drops a module whose requirement is off, transitively", () => {
	expect(effectiveModules(["addon", "extra"], fakeGraph)).toEqual(["core-ish"]);
});

test("keeps a module with its requirements, adds always-on ones, drops unknown ids", () => {
	expect(effectiveModules(["base", "addon", "gone"], fakeGraph)).toEqual([
		"base",
		"addon",
		"core-ish",
	]);
});

test("enhances doesn't make a module depend on another", () => {
	expect(effectiveModules(["base", "addon", "extra"], fakeGraph)).toEqual([
		"base",
		"addon",
		"core-ish",
		"extra",
	]);
});

test("lists the modules in dependency order whatever the order stored", () => {
	expect(effectiveModules(["extra", "side", "addon", "base"], fakeGraph)).toEqual([
		"base",
		"addon",
		"core-ish",
		"extra",
		"side",
	]);
});

test("requirements and dependents are transitive", () => {
	expect(requirementsOf(id("extra"), fakeGraph)).toEqual(["base", "addon"]);
	expect(dependentsOf(id("base"), fakeGraph)).toEqual(["addon", "extra"]);
});

test("a module without requirements or dependents has none listed", () => {
	expect(requirementsOf(id("side"), fakeGraph)).toEqual([]);
	expect(dependentsOf(id("side"), fakeGraph)).toEqual([]);
});
