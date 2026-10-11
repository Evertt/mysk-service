import { describe, expect, test, vi } from "vite-plus/test";

import type { ModuleId } from "#lib/modules/ids.ts";
import { adjustPrices, costs, tag } from "#lib/orders/extensions.ts";
import {
	costsTotal,
	laborCost,
	orderTotal,
	type OrderToPrice,
	priceOrders,
	STANDARD_HOURLY_RATE,
} from "#lib/orders/server/pricing.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";

const locals = { user: { id: "u1", name: "Jo" }, tenant: { organizationId: "north" } };

// The app's database needs `DATABASE_URL`; pricing doesn't use it. The priceOrders tests pass
// the modules that are on.
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
// Made-up modules instead of the ones in `src/modules`, set by the priceOrders tests.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

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

test("costs add up", () => {
	expect(costsTotal([])).toBe(0);
	expect(
		costsTotal([
			{ label: "Materials", amount: 1200 },
			{ label: "Travel", amount: 300 },
		]),
	).toBe(1500);
});

describe("orderTotal", () => {
	test("adds the costs, labour and the adjustments", () => {
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
		laborHours: 2,
		hourlyRate: 6_000,
		...fields,
	});

	const seal = { key: "1", label: "Seal", quantity: "1 pcs", unitPrice: 10_000, amount: 10_000 };
	/** A module that costs every order 10,000 in materials, with an item when asked. */
	const materials = defineServerModule("materials" as ModuleId, [
		contribute(costs, async ({ orders, items }) => {
			const cost = { label: "Materials", amount: 10_000, ...(items && { items: [seal] }) };
			return new Map(orders.map((o) => [o.id, cost]));
		}),
	]);

	test("prices labour alone without modules", async () => {
		registry.modules = [materials];
		expect(await priceOrders([order(1), order(2, { hourlyRate: null })], { enabled: [] })).toEqual([
			{ costs: [], labor: 12_000, adjustments: [], total: 12_000 },
			{ costs: [], labor: 2 * STANDARD_HOURLY_RATE, adjustments: [], total: 17_000 },
		]);
	});

	test("adds the modules' costs, with their items only when asked", async () => {
		registry.modules = [materials];
		const enabled = ["materials"];
		const [plain] = await priceOrders([order(1)], { enabled });
		expect(plain).toEqual({
			costs: [{ label: "Materials", amount: 10_000 }],
			labor: 12_000,
			adjustments: [],
			total: 22_000,
		});
		const [detailed] = await priceOrders([order(1)], { enabled, items: true });
		expect(detailed.costs).toEqual([{ label: "Materials", amount: 10_000, items: [seal] }]);
	});

	test("applies each module's adjustments, in the modules' order, to the orders they name", async () => {
		const seen: unknown[] = [];
		registry.modules = [
			materials,
			defineServerModule("half-labour" as ModuleId, [
				contribute(adjustPrices, async (orders) => {
					seen.push(...orders);
					return new Map([[2, [{ label: "Half labour", amount: -orders[1].labor / 2 }]]]);
				}),
			]),
			defineServerModule("tags-only" as ModuleId, [contribute(tag, async () => new Map())]),
			defineServerModule("fee" as ModuleId, [
				contribute(adjustPrices, async () => new Map([[2, [{ label: "Fee", amount: 500 }]]])),
			]),
		];

		const enabled = ["fee", "tags-only", "half-labour", "materials"];
		const [first, second] = await priceOrders([order(1), order(2)], { enabled });
		expect(first).toMatchObject({ labor: 12_000, adjustments: [], total: 22_000 });
		expect(second.adjustments.map((a) => a.label)).toEqual(["Half labour", "Fee"]);
		expect(second.total).toBe(10_000 + 12_000 - 6_000 + 500);
		// Modules get the labour's cost, not its hours and rate, and the costs.
		expect(seen[0]).toMatchObject({
			id: 1,
			labor: 12_000,
			costs: [{ label: "Materials", amount: 10_000 }],
		});
		expect(seen[0]).not.toHaveProperty("laborHours");
		// Only the modules that are on.
		expect((await priceOrders([order(2)], { enabled: ["fee"] }))[0].adjustments).toEqual([
			{ label: "Fee", amount: 500 },
		]);
	});

	test("a module that fails fails the pricing", async () => {
		registry.modules = [
			defineServerModule("broken" as ModuleId, [
				contribute(adjustPrices, () => Promise.reject(new Error("Broken"))),
			]),
		];
		await expect(priceOrders([order(1)], { enabled: ["broken"] })).rejects.toThrow("Broken");
	});

	test("doesn't ask the modules about no orders", async () => {
		registry.modules = [
			defineServerModule("broken" as ModuleId, [
				contribute(adjustPrices, () => Promise.reject(new Error("Shouldn't be asked"))),
			]),
		];
		expect(await priceOrders([], { enabled: ["broken"] })).toEqual([]);
	});
});
