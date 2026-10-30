import { describe, expect, test } from "vite-plus/test";

import { orderStatuses } from "#lib/models.ts";
import {
	edgesOf,
	lifecycleEdges,
	statusLayout,
} from "#wiki/widgets/order-lifecycle/lifecycle-graph.ts";

describe("the order lifecycle's graph", () => {
	const edges = lifecycleEdges();

	test("a planner accepting a report makes it a quote", () => {
		expect(edges).toContainEqual({
			from: "awaiting_acceptance",
			to: "quote",
			verb: "accept",
			by: "acceptance",
		});
	});

	test("planning a quote with an engineer schedules it (plan's `to` is a function)", () => {
		expect(edges).toContainEqual(
			expect.objectContaining({ from: "quote", to: "scheduled", verb: "plan" }),
		);
	});

	test("an invoiced order only goes back to completed, by voiding its invoice", () => {
		expect(edgesOf("invoiced").out).toEqual([
			{ from: "invoiced", to: "completed", verb: "uninvoice", by: "invoicing" },
		]);
	});

	test("edgesOf lists what comes in as well as what goes out", () => {
		const { in: incoming } = edgesOf("invoiced", edges);
		expect(incoming).toEqual([
			{ from: "completed", to: "invoiced", verb: "invoice", by: "invoicing" },
		]);
	});

	test("no edge goes from a status to itself", () => {
		expect(edges.filter((edge) => edge.from === edge.to)).toEqual([]);
	});

	test("every edge is there once", () => {
		const keys = edges.map(({ from, to, verb }) => `${from}→${to}:${verb}`);
		expect(new Set(keys).size).toBe(keys.length);
	});

	test("every status has a place in the drawing", () => {
		for (const status of orderStatuses) expect(statusLayout[status]).toBeDefined();
	});

	test("a function `to` is applied to each `from`, its distinct outcomes kept", () => {
		const plan = lifecycleEdges({
			plan: {
				by: "planner",
				from: ["quote", "scheduled"],
				to: (from: string, engineerId: number | null) =>
					from === "quote" && engineerId !== null ? "scheduled" : from,
			},
		} as never);
		expect(plan).toEqual([{ from: "quote", to: "scheduled", verb: "plan", by: "planner" }]);
	});
});
