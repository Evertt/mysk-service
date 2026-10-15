import { describe, expect, test } from "vite-plus/test";

import { renderSkeletons, skeletonPage, skeletonProblems } from "./skeletons.ts";
import { module } from "./test-helpers.ts";

describe("skeletonPage", () => {
	test("is the page at the same path in routes/, in the module's folder in the (modules) group", () => {
		expect(skeletonPage("schedule", "skeletons/(app)/page.svelte")).toEqual({
			routeFile: "(app)/+page.svelte",
			routeId: "/(app)/(modules)/schedule",
		});
		expect(skeletonPage("contracts", "skeletons/(app)/[number]/page.svelte")).toEqual({
			routeFile: "(app)/[number]/+page.svelte",
			routeId: "/(app)/(modules)/contracts/[number]",
		});
		expect(skeletonPage("contracts", "skeletons/(app)/[number]/edit/page.svelte").routeId).toBe(
			"/(app)/(modules)/contracts/[number]/edit",
		);
	});
});

describe("skeletonProblems", () => {
	test("refuse a skeleton of no page, and one that isn't a page.svelte", () => {
		const schedule = module("schedule", {
			routeFiles: ["(app)/+page.svelte"],
			skeletonFiles: [
				"skeletons/(app)/page.svelte",
				"skeletons/(app)/board/page.svelte",
				"skeletons/(app)/board.svelte",
			],
		});
		expect(skeletonProblems([schedule])).toEqual([
			"src/modules/schedule/skeletons/(app)/board/page.svelte is the skeleton of no page: " +
				"routes/(app)/board/+page.svelte doesn't exist.",
			"src/modules/schedule/skeletons/(app)/board.svelte: a skeleton is a page.svelte, " +
				"at the path of its page's +page.svelte in routes/.",
		]);
	});
});

describe("renderSkeletons", () => {
	test("is valid and empty with no skeletons", () => {
		const source = renderSkeletons([module("contracts")]);
		expect(source).toContain("load: () => Promise<{ default: Component }>;\n}[] = [];");
		expect(source).not.toContain("import(");
	});

	test("lists a loader for each skeleton by its page's route id, and imports none statically", () => {
		const source = renderSkeletons([
			module("schedule", {
				routeFiles: ["(app)/+page.svelte"],
				skeletonFiles: ["skeletons/(app)/page.svelte"],
			}),
		]);
		expect(source).toContain(
			'\t{\n\t\tmodule: "schedule",\n\t\trouteId: "/(app)/(modules)/schedule",\n' +
				'\t\tload: () => import("#modules/schedule/skeletons/(app)/page.svelte"),\n\t},',
		);
		expect(source).not.toMatch(/^import \w+ from "#modules/m);
	});
});
