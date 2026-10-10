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

test("a change that leaves a module without a requirement is refused, naming that module", () => {
	expect(changeModules(["base"], { enable: ["extra"], disable: [] }, fakeGraph)).toEqual({
		refused: ["extra"],
	});
	expect(
		changeModules(["base", "addon", "extra"], { enable: [], disable: ["base"] }, fakeGraph),
	).toEqual({ refused: ["addon"] });
});

test("an always-on module can't be switched off", () => {
	expect(changeModules([], { enable: [], disable: ["core-ish"] }, fakeGraph)).toEqual({
		refused: ["core-ish"],
	});
});

test("a module in both lists ends up off", () => {
	expect(changeModules(["base"], { enable: ["side"], disable: ["side"] }, fakeGraph)).toEqual({
		stored: ["base"],
	});
});
