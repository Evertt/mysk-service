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
					routeFiles: [
						"(app)/+layout.svelte",
						"(app)/+page.svelte",
						"(app)/[id]/+page.ts",
						"(app)/(inner)/reports/+page.svelte",
					],
				}),
			]),
		).toEqual([]);
	});

	test("refuses a module whose id is a core route's first segment, if it has routes", () => {
		const problems = check([
			module("orders", { routeFiles: ["(app)/+page.svelte"] }),
			module("login", { routeFiles: ["(field)/[id]/+page.svelte"] }),
			// Its own folder: modules can't collide with each other.
			module("other", { routeFiles: ["(app)/+page.svelte"] }),
		]);
		expect(problems).toEqual([
			"src/modules/orders/routes: the module's routes are under /orders, which collides with the core's /orders route.",
			"src/modules/login/routes: the module's routes are under /login, which collides with the core's /login route.",
		]);
		expect(check([module("orders")])).toEqual([]);
	});

	test("refuses routes outside a route group, and unknown route files", () => {
		const problems = check([
			module("a", {
				routeFiles: ["+page.svelte", "a/+page.svelte", "a/(app)/+page.svelte", "(app)/+hooks.ts"],
			}),
		]);
		expect(problems).toHaveLength(4);
		expect(problems.slice(0, 3)).toEqual([
			"src/modules/a/routes/+page.svelte isn't in a route group: a module's routes/ holds groups only (routes/(app)/…), whose files are in the module's own route folder, /a.",
			expect.stringMatching(/a\/routes\/a\/\+page\.svelte isn't in a route group/),
			expect.stringMatching(/a\/routes\/a\/\(app\)\/\+page\.svelte isn't in a route group/),
		]);
		expect(problems[3]).toMatch(/\(app\)\/\+hooks\.ts isn't a route file/);
	});

	test("takes only endpoints in the (api) group, the integrations'", () => {
		expect(check([module("a", { routeFiles: ["(api)/ingest/+server.ts"] })])).toEqual([]);
		expect(
			check([module("a", { routeFiles: ["(api)/+page.svelte", "(api)/x/+page.server.ts"] })]),
		).toEqual([
			"src/modules/a/routes/(api)/+page.svelte: (api) holds integration endpoints only (+server.ts), which take a token instead of a session.",
			expect.stringMatching(
				/\(api\)\/x\/\+page\.server\.ts: \(api\) holds integration endpoints only/,
			),
		]);
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

	test("refuses a settings page that module.ts doesn't name, which nothing would link to", () => {
		const routeFiles = ["(app)/+page.svelte", "(app)/settings/+page.svelte"];
		expect(check([module("a", { routeFiles })])).toEqual([
			`src/modules/a/module.ts: the module has a settings page (routes/(app)/settings/+page.svelte), so it declares it, for the settings page to link to: settings: "/(app)/(modules)/a/settings".`,
		]);
		expect(check([module("a", { routeFiles, declaresSettings: true })])).toEqual([]);
	});

	test("refuses a manifest whose id isn't the folder's", () => {
		expect(check([module("a", { declaredId: "b" })])).toEqual([
			`src/modules/a/module.ts: its id is "b", but the folder is "a".`,
		]);
	});
});
