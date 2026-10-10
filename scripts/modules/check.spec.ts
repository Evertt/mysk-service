import { describe, expect, test } from "vite-plus/test";

import { checkModules } from "./check.ts";
import type { ModuleFolder } from "./shared.ts";
import { module } from "./test-helpers.ts";

describe("checkModules", () => {
	const options = {
		coreRouteFolders: ["(app)/orders", "login"],
		patterns: ["./messages/{locale}/common.json"],
		locales: ["en", "nl"],
	};
	const check = (modules: ModuleFolder[]) => checkModules(modules, options);

	test("accepts a module that keeps to itself", () => {
		expect(
			check([
				module("sample", {
					routeFiles: ["(app)/sample/+page.svelte", "(app)/sample/[id]/+page.ts"],
				}),
			]),
		).toEqual([]);
	});

	test("refuses route folders that collide with the core's or another module's", () => {
		const problems = check([
			module("a", { routeFiles: ["(app)/orders/+page.svelte", "(app)/shared/+page.svelte"] }),
			module("b", { routeFiles: ["(app)/shared/+page.svelte", "login/+page.svelte"] }),
		]);
		expect(problems).toHaveLength(3);
		expect(problems[0]).toMatch(/a\/routes\/\(app\)\/orders collides with the core's \/orders/);
		expect(problems[1]).toMatch(
			/b\/routes\/\(app\)\/shared collides with the \/shared route of the a module/,
		);
		expect(problems[2]).toMatch(/login collides with the core's \/login/);
	});

	test("refuses routes outside a folder of the module's own, and unknown route files", () => {
		const problems = check([
			module("a", {
				routeFiles: [
					"(app)/+layout.svelte",
					"+page.svelte",
					"(app)/a/+hooks.ts",
					"(app)/[id]/+page.svelte",
				],
			}),
		]);
		expect(problems).toHaveLength(4);
		expect(problems.join("\n")).toMatch(/outside a route folder of its own/);
		expect(problems.join("\n")).not.toMatch(/\(modules\)/);
		expect(problems.join("\n")).toMatch(/isn't a route file/);
		expect(problems.join("\n")).toMatch(/plain name/);
	});

	test("refuses routes in a (modules) group, which is the generator's", () => {
		expect(
			check([module("a", { routeFiles: ["(app)/(modules)/a/+page.svelte"] })]).join("\n"),
		).toMatch(/a\/routes\/\(app\)\/\(modules\)\/a\/\+page\.svelte: \(modules\) is the group/);
	});

	test("refuses message sections that are missing in a language or not unique", () => {
		const problems = check([
			module("a", { messages: { en: ["a", "common"], nl: ["a"] } }),
			module("b", { messages: { en: ["a"], nl: ["a"] } }),
		]);
		expect(problems.join("\n")).toMatch(/a\/messages\/nl\/common\.json is missing/);
		expect(problems.join("\n")).toMatch(/section "common" is also the core's/);
		expect(problems.join("\n")).toMatch(/section "a" is also the a module's/);
	});

	test("refuses a manifest whose id isn't the folder's", () => {
		expect(check([module("a", { declaredId: "b" })])).toEqual([
			`src/modules/a/module.ts: its id is "b", but the folder is "a".`,
		]);
	});
});
