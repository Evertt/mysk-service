import type { Component } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

import { loadModuleSkeletons, pageShape } from "#routes/(app)/page-skeleton.ts";

describe("pageShape", () => {
	test.each([
		["/(app)/(dashboard)", "dashboard"],
		["/(app)/orders", "list"],
		["/(app)/(modules)/contracts", "list"],
		["/(app)/orders/[number]", "detail"],
		["/(app)/(modules)/materials/[sku]", "detail"],
		["/(app)/orders/new", "form"],
		["/(app)/customers/[code]/edit", "form"],
		["/(app)/(modules)/invoices/new", "form"],
		["/(app)/settings", "cards"],
		["/(app)/(modules)/invoices/settings", "form"],
	])("%s is a %s", (routeId, shape) => {
		expect(pageShape(routeId)).toBe(shape);
	});

	test("a route SvelteKit doesn't know gets the details' outline", () => {
		expect(pageShape(null)).toBe("detail");
	});
});

describe("loadModuleSkeletons", () => {
	const Board = (() => {}) as unknown as Component;
	const Plans = (() => {}) as unknown as Component;
	const loadPlans = vi.fn(async () => ({ default: Plans }));
	const registry = [
		{
			module: "schedule",
			routeId: "/(app)/(modules)/schedule",
			load: async () => ({ default: Board }),
		},
		{ module: "maintenance", routeId: "/(app)/(modules)/maintenance", load: loadPlans },
	];

	test("loads the skeletons of the tenant's modules, by route id, and only those", async () => {
		expect([...(await loadModuleSkeletons(["schedule", "contracts"], registry))]).toEqual([
			["/(app)/(modules)/schedule", Board],
		]);
		expect(loadPlans).not.toHaveBeenCalled();
	});
});
