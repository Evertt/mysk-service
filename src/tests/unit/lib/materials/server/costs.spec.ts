import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, test, vi } from "vite-plus/test";

import { lineTotalSql, materialCosts } from "#lib/materials/server/costs.ts";
import { lineTotal } from "#lib/models.ts";
import type { OrderFacts } from "#lib/orders/extensions.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

const tenant: Tenant = {
	organizationId: "north",
	name: "North",
	slug: "north",
	roles: ["member"],
	modules: ["materials"],
};
const locals = { user: { id: "u1", name: "Jo" }, tenant };

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
// An in-memory database with just the tables the costs read, instead of the app's.
vi.mock("#lib/server/db/index.ts", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
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

describe("materialCosts", () => {
	beforeAll(async () => {
		await db.$client.executeMultiple(`
			create table material (
				id integer primary key, organization_id text, sku text, name text, unit text,
				unit_price integer, stock real
			);
			create table order_line (
				id integer primary key, organization_id text, order_id integer, material_id integer,
				quantity real, unit_price integer
			);
			insert into material values
				(1, 'north', 'MAT-0001', 'Seal', 'pcs', 3, 10), (2, 'north', 'MAT-0002', 'Pipe', 'm', 1999, 10),
				(3, 'south', 'MAT-0001', 'Belt', 'pcs', 999, 10);
			insert into order_line (id, organization_id, order_id, material_id, quantity, unit_price) values
				(1, 'north', 1, 1, 2, 3), (2, 'north', 1, 2, 1.5, 1999), (3, 'north', 2, 1, 4, 100),
				(4, 'south', 3, 3, 1, 999);
		`);
	});

	const orders = (...ids: number[]) =>
		ids.map((id): OrderFacts => ({
			id,
			type: "repair",
			status: "completed",
			equipmentId: null,
			createdAt: new Date(2026, 9, 1),
		}));

	test("adds the current tenant's lines up per order, and nothing for an order without", async () => {
		const costs = await materialCosts({ orders: orders(1, 2, 3, 4), items: false });
		expect([...costs]).toEqual([
			[1, { label: "Materials", amount: 6 + 2999 }],
			[2, { label: "Materials", amount: 400 }],
			// Another tenant's order's lines aren't this tenant's.
			[3, { label: "Materials", amount: 0 }],
			[4, { label: "Materials", amount: 0 }],
		]);
	});

	test("lists the lines when asked, linking to their materials", async () => {
		const costs = await materialCosts({ orders: orders(1, 4), items: true });
		expect(costs.get(1)?.items).toEqual([
			{
				key: "1",
				label: "Seal",
				detail: "MAT-0001",
				subject: { type: "material", id: "1", label: "MAT-0001" },
				quantity: "2 pcs",
				unitPrice: 3,
				amount: 6,
			},
			{
				key: "2",
				label: "Pipe",
				detail: "MAT-0002",
				subject: { type: "material", id: "2", label: "MAT-0002" },
				quantity: "1.5 m",
				unitPrice: 1999,
				amount: 2999,
			},
		]);
		expect(costs.get(4)).toMatchObject({ items: [], empty: "No materials on this order." });
	});
});
