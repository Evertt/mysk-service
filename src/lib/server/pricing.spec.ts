import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { lineTotal } from "#lib/models.js";
import { db } from "#lib/server/db/index.js";

import type { ServerModule } from "./modules.ts";
import {
	laborCost,
	lineTotalSql,
	materialsPerOrder,
	orderTotal,
	type OrderToPrice,
	priceOrders,
	STANDARD_HOURLY_RATE,
} from "./pricing.ts";

const locals = { user: { id: "u1", name: "Jo" }, tenant: { organizationId: "north" } };

// An in-memory database instead of the app's, which needs `DATABASE_URL`. The priceOrders tests
// pass their own modules.
vi.mock("#lib/server/db/index.js", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.js");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
});
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
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

describe("lineTotalSql", () => {
	test.each([
		[2, 1999],
		[1.5, 3],
		[0.25, 4999],
		[1 / 3, 8500],
		[0, 100],
	])("rounds %d × %d like lineTotal", async (quantity, unitPrice) => {
		const line = { quantity: sql`${quantity}`, unitPrice: sql`${unitPrice}` };
		const row = await db.get<{ total: number }>(sql`select ${lineTotalSql(line)} as total`);
		expect(row.total).toBe(lineTotal(quantity, unitPrice));
	});
});

describe("materialsPerOrder", () => {
	beforeAll(async () => {
		await db.run(sql`create table order_line (
			id integer primary key, organization_id text, order_id integer, material_id integer,
			quantity real, unit_price integer
		)`);
		await db.run(sql`insert into order_line (organization_id, order_id, quantity, unit_price) values
			('north', 1, 1.5, 3), ('north', 1, 2, 1999), ('north', 2, 4, 100), ('south', 3, 1, 999)`);
	});

	test("adds the current tenant's lines up per order", async () => {
		const rows = await db
			.select()
			.from(materialsPerOrder())
			.orderBy(sql`order_id`);
		expect(rows).toEqual([
			{ orderId: 1, total: 5 + 3998 },
			{ orderId: 2, total: 400 },
		]);
	});
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
