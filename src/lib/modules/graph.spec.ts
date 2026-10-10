import { expect, test } from "vite-plus/test";

import { fakeGraph } from "./fakes.ts";
import {
	changeModules,
	dependentsOf,
	effectiveModules,
	moduleSetProblems,
	requirementsOf,
} from "./graph.ts";
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

test("finds stored modules without their requirements", () => {
	expect(moduleSetProblems(["addon", "extra"], fakeGraph)).toEqual([
		{ module: "addon", missing: ["base"] },
	]);
	expect(moduleSetProblems(["extra"], fakeGraph)).toEqual([
		{ module: "extra", missing: ["addon"] },
	]);
	expect(moduleSetProblems(["base", "addon"], fakeGraph)).toEqual([]);
});

test("an always-on requirement is never missing, and unknown ids are ignored", () => {
	const graph = {
		...fakeGraph,
		side: { requires: ["core-ish"], enhances: [], alwaysOn: false },
	};
	expect(moduleSetProblems(["side", "gone"], graph)).toEqual([]);
});

test("changing the set enables and disables, keeping the graph's order", () => {
	expect(changeModules(["base"], { enable: ["addon", "extra"], disable: [] }, fakeGraph)).toEqual({
		stored: ["base", "addon", "extra"],
	});
	expect(
		changeModules(
			["base", "addon", "extra"],
			{ enable: [], disable: ["extra", "addon"] },
			fakeGraph,
		),
	).toEqual({ stored: ["base"] });
});

test("a change that leaves a module without a requirement is refused, saying which", () => {
	expect(changeModules(["base"], { enable: ["extra"], disable: [] }, fakeGraph)).toEqual({
		refused: { alwaysOn: [], unmet: ["extra"] },
	});
	expect(
		changeModules(["base", "addon", "extra"], { enable: [], disable: ["base"] }, fakeGraph),
	).toEqual({ refused: { alwaysOn: [], unmet: ["addon"] } });
});

test("switching off an always-on module is refused as such, and one is never stored", () => {
	expect(changeModules([], { enable: [], disable: ["core-ish"] }, fakeGraph)).toEqual({
		refused: { alwaysOn: ["core-ish"], unmet: [] },
	});
	expect(changeModules([], { enable: ["core-ish"], disable: [] }, fakeGraph)).toEqual({
		stored: [],
	});
	expect(changeModules(["core-ish", "base"], { enable: [], disable: [] }, fakeGraph)).toEqual({
		stored: ["base"],
	});
});

test("a stale row doesn't block an unrelated change, and stays", () => {
	// addon is stored without base, so it's off; switching side on is fine all the same.
	expect(changeModules(["addon"], { enable: ["side"], disable: [] }, fakeGraph)).toEqual({
		stored: ["addon", "side"],
	});
	// So is switching the stale module off.
	expect(changeModules(["addon"], { enable: [], disable: ["addon"] }, fakeGraph)).toEqual({
		stored: [],
	});
});

test("switching a stale module on with what it requires mends it", () => {
	expect(changeModules(["addon"], { enable: ["addon", "base"], disable: [] }, fakeGraph)).toEqual({
		stored: ["base", "addon"],
	});
});

test("a stale module that a change leaves missing more is refused", () => {
	// extra was stored without addon; switching addon on without base leaves addon short.
	expect(changeModules(["extra"], { enable: ["addon"], disable: [] }, fakeGraph)).toEqual({
		refused: { alwaysOn: [], unmet: ["addon"] },
	});
});

test("a module in both lists ends up off", () => {
	expect(changeModules(["base"], { enable: ["side"], disable: ["side"] }, fakeGraph)).toEqual({
		stored: ["base"],
	});
});
