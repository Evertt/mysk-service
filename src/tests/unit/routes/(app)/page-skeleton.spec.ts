import type { Component } from "svelte";
import { describe, expect, test } from "vite-plus/test";

import { moduleSkeletonsOf, pageShape } from "#routes/(app)/page-skeleton.ts";

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

describe("moduleSkeletonsOf", () => {
	const Board = (() => {}) as unknown as Component;
	const Plans = (() => {}) as unknown as Component;
	const registry = [
		{ module: "schedule", routeId: "/(app)/(modules)/schedule", skeleton: Board },
		{ module: "maintenance", routeId: "/(app)/(modules)/maintenance", skeleton: Plans },
	];

	test("has the skeletons of the tenant's modules, by route id", () => {
		expect([...moduleSkeletonsOf(["schedule", "contracts"], registry)]).toEqual([
			["/(app)/(modules)/schedule", Board],
		]);
	});
});
