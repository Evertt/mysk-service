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
		expect(renderSkeletons([module("contracts")])).toContain(
			"export const moduleSkeletons: { module: string; routeId: string; skeleton: Component }[] = [];",
		);
	});

	test("imports each skeleton and lists it by its page's route id", () => {
		const source = renderSkeletons([
			module("schedule", {
				routeFiles: ["(app)/schedule/+page.svelte"],
				skeletonFiles: ["skeletons/(app)/schedule.svelte"],
			}),
		]);
		expect(source).toContain(
			'import scheduleSkeleton0 from "#modules/schedule/skeletons/(app)/schedule.svelte";',
		);
		expect(source).toContain(
			'{ module: "schedule", routeId: "/(app)/(modules)/schedule", skeleton: scheduleSkeleton0 },',
		);
	});
});
