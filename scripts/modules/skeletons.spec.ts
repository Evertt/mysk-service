import { describe, expect, test } from "vite-plus/test";

import { renderSkeletons, skeletonPage, skeletonProblems } from "./skeletons.ts";
import { module } from "./test-helpers.ts";

describe("skeletonPage", () => {
	test("is the page at the same path in routes/, with the (modules) group in its route id", () => {
		expect(skeletonPage("skeletons/(app)/schedule.svelte")).toEqual({
			routeFile: "(app)/schedule/+page.svelte",
			routeId: "/(app)/(modules)/schedule",
		});
		expect(skeletonPage("skeletons/(app)/contracts/[number].svelte")).toEqual({
			routeFile: "(app)/contracts/[number]/+page.svelte",
			routeId: "/(app)/(modules)/contracts/[number]",
		});
	});
});

describe("skeletonProblems", () => {
	test("refuse a skeleton of no page", () => {
		const schedule = module("schedule", {
			routeFiles: ["(app)/schedule/+page.svelte"],
			skeletonFiles: ["skeletons/(app)/schedule.svelte", "skeletons/(app)/board.svelte"],
		});
		expect(skeletonProblems([schedule])).toEqual([
			"src/modules/schedule/skeletons/(app)/board.svelte is the skeleton of no page: " +
				"routes/(app)/board/+page.svelte doesn't exist.",
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
				routeFiles: ["(app)/schedule/+page.svelte"],
				skeletonFiles: ["skeletons/(app)/schedule.svelte"],
			}),
		]);
		expect(source).toContain(
			'\t{\n\t\tmodule: "schedule",\n\t\trouteId: "/(app)/(modules)/schedule",\n' +
				'\t\tload: () => import("#modules/schedule/skeletons/(app)/schedule.svelte"),\n\t},',
		);
		expect(source).not.toMatch(/^import \w+ from "#modules/m);
	});
});
