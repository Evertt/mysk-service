import { describe, expect, test } from "vite-plus/test";

import { moduleIds } from "#lib/modules/ids.ts";
import {
	moduleEdges,
	moduleStates,
	requiresDrawing,
	requiresLayout,
} from "#wiki/widgets/module-map/module-map.ts";

describe("the module map", () => {
	test("every module switched on is on", () => {
		const states = moduleStates([...moduleIds]);
		expect(Object.values(states)).toEqual(moduleIds.map(() => "on"));
		expect(Object.keys(states)).toEqual([...moduleIds]);
	});

	test("switching invoices off drops what requires it, directly or through another", () => {
		const states = moduleStates(moduleIds.filter((id) => id !== "invoices"));
		expect(states.invoices).toBe("off");
		expect(states["partner-programme"]).toBe("dropped");
		expect(states["parts-shop"]).toBe("dropped");
		expect(states.materials).toBe("on");
	});

	test("a module switched off is off, not dropped, whatever it requires", () => {
		const states = moduleStates([]);
		expect(new Set(Object.values(states))).toEqual(new Set(["off"]));
	});

	test("the edges say what requires and what enhances what", () => {
		const edges = moduleEdges();
		expect(edges).toContainEqual({ from: "parts-shop", to: "materials", kind: "requires" });
		expect(edges).toContainEqual({ from: "partner-programme", to: "invoices", kind: "requires" });
		expect(edges).toContainEqual({ from: "docks", to: "energy", kind: "enhances" });
	});

	test("the drawing of what requires what puts each module below what it requires, boxes apart", () => {
		const { positions, height } = requiresLayout();
		expect([...positions.keys()].sort()).toEqual(
			["invoices", "materials", "partner-programme", "parts-shop"].sort(),
		);
		for (const { from, to } of moduleEdges().filter((edge) => edge.kind === "requires")) {
			expect(positions.get(from)!.y).toBeGreaterThan(positions.get(to)!.y);
		}
		const boxes = [...positions.values()];
		for (const [index, a] of boxes.entries()) {
			expect(a.x - requiresDrawing.nodeWidth / 2).toBeGreaterThanOrEqual(0);
			expect(a.x + requiresDrawing.nodeWidth / 2).toBeLessThanOrEqual(requiresDrawing.width);
			expect(a.y + requiresDrawing.nodeHeight / 2).toBeLessThanOrEqual(height);
			for (const b of boxes.slice(index + 1)) {
				const apart =
					Math.abs(a.x - b.x) >= requiresDrawing.nodeWidth ||
					Math.abs(a.y - b.y) >= requiresDrawing.nodeHeight;
				expect(apart).toBe(true);
			}
		}
	});
});
