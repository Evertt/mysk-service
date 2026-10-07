import { describe, expect, test, vi } from "vite-plus/test";

import type { ServerModule } from "./modules.ts";
import {
	laborCost,
	orderTotal,
	type OrderToPrice,
	priceOrders,
	STANDARD_HOURLY_RATE,
} from "./pricing.ts";

// The modules' server code needs the app's database; these tests pass their own modules.
vi.mock("#lib/server/db/index.js", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals: {} }) }));
vi.mock("#lib/components/contracts/coverage.remote.js", () => ({}));
vi.mock("#lib/components/invoicing/invoicing.remote.js", () => ({}));

test("labour is charged at the engineer's hourly rate", () => {
	expect(laborCost(2.5, 6000)).toBe(15_000);
});

test.each([null, undefined])(
	"an unassigned order (rate %s) is estimated at the standard rate",
	(rate) => {
		expect(laborCost(2, rate)).toBe(2 * STANDARD_HOURLY_RATE);
	},
);

test("a rate of zero is a rate, not a missing one", () => {
	expect(laborCost(3, 0)).toBe(0);
});

test("partial hours are rounded to whole cents", () => {
	expect(laborCost(1 / 3, 8500)).toBe(2833);
	expect(laborCost(0.25, 4999)).toBe(1250);
});

test("no hours cost nothing", () => {
	expect(laborCost(0, null)).toBe(0);
});

describe("orderTotal", () => {
	test("adds materials, labour and the adjustments", () => {
		expect(orderTotal(10_000, 5_000, [])).toBe(15_000);
		expect(
			orderTotal(10_000, 5_000, [
				{ label: "Labour included", amount: -5_000 },
				{ label: "Call-out fee", amount: 2_500 },
			]),
		).toBe(12_500);
	});

	test("never goes below zero", () => {
		expect(orderTotal(1_000, 0, [{ label: "Goodwill", amount: -5_000 }])).toBe(0);
	});
});

describe("priceOrders", () => {
	const order = (id: number, fields: Partial<OrderToPrice> = {}): OrderToPrice => ({
		id,
		type: "repair",
		status: "completed",
		equipmentId: id,
		createdAt: new Date(2026, 9, 1),
		materials: 10_000,
		laborHours: 2,
		hourlyRate: 6_000,
		...fields,
	});

	test("prices materials and labour without modules", async () => {
		expect(await priceOrders([order(1), order(2, { hourlyRate: null })], [])).toEqual([
			{ materials: 10_000, labor: 12_000, adjustments: [], total: 22_000 },
			{ materials: 10_000, labor: 2 * STANDARD_HOURLY_RATE, adjustments: [], total: 27_000 },
		]);
	});

	test("applies each module's adjustments, in the modules' order, to the orders they name", async () => {
		const seen: unknown[] = [];
		const halfLabour: ServerModule = {
			async adjustPrices(orders) {
				seen.push(...orders);
				return new Map([[2, [{ label: "Half labour", amount: -orders[1].labor / 2 }]]]);
			},
		};
		const fee: ServerModule = {
			async adjustPrices() {
				return new Map([[2, [{ label: "Fee", amount: 500 }]]]);
			},
		};
		const tagsOnly: ServerModule = { tagOrders: async () => new Map() };

		const [first, second] = await priceOrders([order(1), order(2)], [halfLabour, tagsOnly, fee]);
		expect(first).toEqual({ materials: 10_000, labor: 12_000, adjustments: [], total: 22_000 });
		expect(second.adjustments.map((a) => a.label)).toEqual(["Half labour", "Fee"]);
		expect(second.total).toBe(10_000 + 12_000 - 6_000 + 500);
		// Modules get the labour's cost, not its hours and rate.
		expect(seen[0]).toMatchObject({ id: 1, materials: 10_000, labor: 12_000 });
		expect(seen[0]).not.toHaveProperty("laborHours");
	});

	test("doesn't ask the modules about no orders", async () => {
		const module: ServerModule = {
			adjustPrices: () => Promise.reject(new Error("Shouldn't be asked")),
		};
		expect(await priceOrders([], [module])).toEqual([]);
	});
});
