import { expect, test } from "vite-plus/test";

import { byDependency, graphProblems } from "./graph.ts";
import { module } from "./test-helpers.ts";

test("finds unknown and own ids", () => {
	expect(graphProblems([module("a", { requires: ["a", "x"] })])).toEqual([
		"src/modules/a requires itself.",
		"src/modules/a requires x, which isn't a module.",
	]);
});

test("finds unknown and own ids in enhances", () => {
	expect(graphProblems([module("a", { enhances: ["a", "x"] })])).toEqual([
		"src/modules/a enhances itself.",
		"src/modules/a enhances x, which isn't a module.",
	]);
});

test("finds a requires cycle and prints it", () => {
	const modules = [module("a", { requires: ["b"] }), module("b", { requires: ["a"] })];
	expect(graphProblems(modules)).toEqual(["src/modules: a requires cycle: a → b → a."]);
});

test("prints only the cycle when a module merely leads into it", () => {
	const modules = [
		module("a", { requires: ["b"] }),
		module("b", { requires: ["c"] }),
		module("c", { requires: ["b"] }),
	];
	expect(graphProblems(modules)).toEqual(["src/modules: a requires cycle: b → c → b."]);
});

test("allows enhances both ways", () => {
	expect(
		graphProblems([module("a", { enhances: ["b"] }), module("b", { enhances: ["a"] })]),
	).toEqual([]);
});

test("sorts by requires, ties by id", () => {
	const modules = [module("a", { requires: ["c"] }), module("b"), module("c")];
	expect(byDependency(modules).map((m) => m.id)).toEqual(["b", "c", "a"]);
});

test("keeps every module when there is a cycle", () => {
	const modules = [module("a", { requires: ["b"] }), module("b", { requires: ["a"] }), module("c")];
	expect(byDependency(modules).map((m) => m.id)).toEqual(["c", "a", "b"]);
});

test("finds a module whose sidebar entry goes after itself", () => {
	expect(graphProblems([module("a", { navAfter: "a" }), module("b", { navAfter: "a" })])).toEqual([
		"src/modules/a nav.after itself.",
	]);
});

test("an always-on module can't require one that can be switched off", () => {
	expect(graphProblems([module("a", { alwaysOn: true, requires: ["b"] }), module("b")])).toEqual([
		"src/modules/a is always on, so it can't require b, which can be switched off.",
	]);
	expect(
		graphProblems([
			module("a", { alwaysOn: true, requires: ["b"] }),
			module("b", { alwaysOn: true }),
		]),
	).toEqual([]);
});
