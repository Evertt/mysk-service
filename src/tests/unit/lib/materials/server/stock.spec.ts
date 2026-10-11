import { rmSync } from "node:fs";

import { isHttpError } from "@sveltejs/kit";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	heldLines,
	moveOrderStock,
	moveStock,
	type OrderStock,
	OrderStockShortage,
	StockShortage,
	stockChanges,
	stockLevelSql,
	withBalances,
} from "#lib/materials/server/stock.ts";
import { type MaterialUnit, roundQuantity, stockLevel } from "#lib/models.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { material } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the tables the ledger touches, instead of the app's. Not an
// in-memory one: libsql gives a transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "stock-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table material (
			id integer primary key, organization_id text not null, sku text not null,
			name text not null, unit text not null, unit_price integer not null, stock real not null
		);
		create table stock_movement (
			id integer primary key, organization_id text not null, material_id integer not null,
			quantity real not null, kind text not null, order_id integer, order_number text,
			user_id text, note text, created_at integer not null default (unixepoch())
		);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules: [],
});

/** Runs `moveStock` in a transaction, like the app does. */
const move = (movement: Parameters<typeof moveStock>[1]) =>
	db.transaction((tx) => moveStock(tx as unknown as Transaction, movement));

/** A material's stock and the sum of its movements. */
async function ledger(materialId: number) {
	const [{ stock }] = (
		await db.$client.execute({ sql: "select stock from material where id = ?", args: [materialId] })
	).rows as unknown as { stock: number }[];
	const movements = (
		await db.$client.execute({
			sql: "select quantity, kind, user_id, order_number, note from stock_movement where material_id = ? order by id",
			args: [materialId],
		})
	).rows.map((row) => ({ ...row }));
	return { stock, movements };
}

describe("moveStock", () => {
	beforeEach(async () => {
		Object.assign(locals, { user: { id: "u1", name: "Jo" }, tenant: tenant("north") });
		await db.$client.executeMultiple(`
			delete from stock_movement;
			delete from material;
			insert into material values (1, 'north', 'MAT-0001', 'Copper pipe', 'm', 900, 10);
			insert into material values (2, 'south', 'MAT-0001', 'Ball valve', 'pcs', 1800, 5);
		`);
	});

	test("records the movement and updates the balance with it", async () => {
		expect(
			await move({ materialId: 1, quantity: 2.25, kind: "receipt", note: "Delivery" }),
		).toEqual({ id: 1, sku: "MAT-0001", name: "Copper pipe", unit: "m", stock: 12.25 });
		await move({ materialId: 1, quantity: -4.1, kind: "consumption", orderNumber: "ORD-1" });
		expect(await ledger(1)).toEqual({
			stock: 8.15,
			movements: [
				{ quantity: 2.25, kind: "receipt", user_id: "u1", order_number: null, note: "Delivery" },
				{ quantity: -4.1, kind: "consumption", user_id: "u1", order_number: "ORD-1", note: null },
			],
		});
	});

	test("refuses to take the stock below zero, and changes nothing", async () => {
		await expect(move({ materialId: 1, quantity: -10.01, kind: "consumption" })).rejects.toThrow(
			new StockShortage({ id: 1, sku: "MAT-0001", name: "Copper pipe", unit: "m", stock: 10 }),
		);
		expect(await ledger(1)).toEqual({ stock: 10, movements: [] });

		// All of it is fine.
		await move({ materialId: 1, quantity: -10, kind: "consumption" });
		expect((await ledger(1)).stock).toBe(0);
	});

	test("says how much there is in the shortage", () => {
		const shortage = new StockShortage({
			id: 1,
			sku: "X",
			name: "Ball valve",
			unit: "pcs",
			stock: 3,
		});
		expect(shortage.message).toBe("Only 3 pcs of Ball valve in stock");
	});

	test("records nothing for a zero quantity", async () => {
		await move({ materialId: 1, quantity: 0.001, kind: "adjustment" });
		expect(await ledger(1)).toEqual({ stock: 10, movements: [] });
	});

	test("doesn't touch another tenant's material", async () => {
		const error = await move({ materialId: 2, quantity: 5, kind: "receipt" }).catch((e) => e);
		expect(isHttpError(error) && error.status).toBe(404);
		expect(await ledger(2)).toEqual({ stock: 5, movements: [] });
	});
});

describe("heldLines", () => {
	const lines = [{ materialId: 1, quantity: 2 }];

	test("an order holds its lines' stock from scheduled on", () => {
		for (const status of ["scheduled", "in_progress", "completed", "invoiced"] as const) {
			expect(heldLines({ status, lines }), status).toBe(lines);
		}
	});

	test("a quote and a cancelled order hold nothing", () => {
		expect(heldLines({ status: "quote", lines })).toEqual([]);
		expect(heldLines({ status: "cancelled", lines })).toEqual([]);
	});
});

describe("moveOrderStock", () => {
	const order = { id: 7, number: "ORD-7" };
	const lines = [
		{ materialId: 1, quantity: 4 },
		{ materialId: 3, quantity: 2 },
	];
	/** Runs `moveOrderStock` in a transaction, like the app does. */
	const moveOrder = (
		movedOrder: typeof order,
		before: OrderStock,
		after: OrderStock,
		note?: string,
	) =>
		db.transaction((tx) =>
			moveOrderStock(tx as unknown as Transaction, movedOrder, before, after, note),
		);

	beforeEach(async () => {
		Object.assign(locals, { user: { id: "u1", name: "Jo" }, tenant: tenant("north") });
		await db.$client.executeMultiple(`
			delete from stock_movement;
			delete from material;
			insert into material values (1, 'north', 'MAT-0001', 'Copper pipe', 'm', 900, 10);
			insert into material values (3, 'north', 'MAT-0003', 'Ball valve', 'pcs', 1800, 5);
		`);
	});

	test("a quote's lines take nothing; scheduling it takes them", async () => {
		await moveOrder(order, { status: "quote", lines: [] }, { status: "quote", lines });
		expect((await ledger(1)).movements).toEqual([]);

		await moveOrder(order, { status: "quote", lines }, { status: "scheduled", lines });
		expect(await ledger(1)).toMatchObject({
			stock: 6,
			movements: [{ quantity: -4, kind: "consumption", order_number: "ORD-7" }],
		});
		expect((await ledger(3)).stock).toBe(3);
	});

	test("moving on from scheduled takes nothing more", async () => {
		await moveOrder(order, { status: "quote", lines }, { status: "scheduled", lines });
		await moveOrder(order, { status: "scheduled", lines }, { status: "in_progress", lines });
		await moveOrder(order, { status: "in_progress", lines }, { status: "completed", lines });
		expect((await ledger(1)).movements).toHaveLength(1);
	});

	test("cancelling returns what it held, and reopening takes it again", async () => {
		await moveOrder(order, { status: "quote", lines }, { status: "scheduled", lines });
		await moveOrder(order, { status: "scheduled", lines }, { status: "cancelled", lines });
		expect(await ledger(1)).toMatchObject({
			stock: 10,
			movements: [{ kind: "consumption" }, { quantity: 4, kind: "return" }],
		});
		await moveOrder(order, { status: "cancelled", lines }, { status: "scheduled", lines });
		expect((await ledger(1)).stock).toBe(6);
	});

	test("removing the lines of a cancelled order returns nothing", async () => {
		await moveOrder(order, { status: "cancelled", lines }, { status: "cancelled", lines: [] }, "x");
		expect((await ledger(1)).movements).toEqual([]);
	});

	test("refuses a shortage, saying what the order can have, and the transaction takes nothing", async () => {
		const more = [
			{ materialId: 1, quantity: 4 },
			{ materialId: 3, quantity: 6 },
		];
		const error = await moveOrder(
			order,
			{ status: "quote", lines: [] },
			{ status: "scheduled", lines: more },
		).catch((e) => e);
		expect(error).toBeInstanceOf(OrderStockShortage);
		expect(error).toMatchObject({ materialId: 3, available: 5 });
		expect(error.message).toBe("Only 5 pcs of Ball valve in stock");
		expect((await ledger(1)).movements).toEqual([]);

		// What it already holds counts towards what it can have.
		await moveOrder(order, { status: "quote", lines }, { status: "scheduled", lines });
		const again = await moveOrder(
			order,
			{ status: "scheduled", lines },
			{ status: "scheduled", lines: more },
		).catch((e) => e);
		expect(again).toMatchObject({ materialId: 3, available: 5 });
	});
});

test("quantities are rounded to two decimals, without noise or negative zero", () => {
	expect(roundQuantity(0.1 + 0.2)).toBe(0.3);
	expect(roundQuantity(2.345)).toBe(2.35);
	expect(roundQuantity(-0.001)).toBe(0);
	expect(Object.is(roundQuantity(-0.001), 0)).toBe(true);
});

describe("stockChanges", () => {
	test("new lines consume, removed lines return", () => {
		expect(stockChanges([], [{ materialId: 1, quantity: 3 }])).toEqual(new Map([[1, 3]]));
		expect(stockChanges([{ materialId: 1, quantity: 3 }], [])).toEqual(new Map([[1, -3]]));
	});

	test("a changed quantity consumes or returns the difference", () => {
		const before = [
			{ materialId: 1, quantity: 3 },
			{ materialId: 2, quantity: 1.5 },
		];
		const after = [
			{ materialId: 1, quantity: 5 },
			{ materialId: 2, quantity: 0.25 },
		];
		expect(stockChanges(before, after)).toEqual(
			new Map([
				[1, 2],
				[2, -1.25],
			]),
		);
	});

	test("lines of the same material count together, and unchanged totals are left out", () => {
		const before = [{ materialId: 1, quantity: 4 }];
		const after = [
			{ materialId: 1, quantity: 1.1 },
			{ materialId: 1, quantity: 2.9 },
			{ materialId: 2, quantity: 1 },
		];
		expect(stockChanges(before, after)).toEqual(new Map([[2, 1]]));
	});
});

test("balances count back from the current stock, newest first", () => {
	const movements = [
		{ id: 3, quantity: -2 },
		{ id: 2, quantity: 0.5 },
		{ id: 1, quantity: 10 },
	];
	expect(withBalances(movements, 8.5).map((m) => [m.id, m.balance])).toEqual([
		[3, 8.5],
		[2, 10.5],
		[1, 10],
	]);
});

describe("stockLevelSql", () => {
	test("says what stockLevel() says, at and around every unit's threshold", async () => {
		const cases: [number, MaterialUnit][] = [
			[-1, "pcs"],
			[0, "pcs"],
			[1, "pcs"],
			[9, "pcs"],
			[10, "pcs"],
			[0.01, "m"],
			[49.99, "m"],
			[50, "kg"],
			[49.5, "l"],
			[120, "l"],
		];
		await db.$client.execute("delete from material");
		await db.insert(material).values(
			cases.map(([stock, unit], i) => ({
				id: i + 1,
				organizationId: "north",
				sku: `MAT-${i}`,
				name: `Material ${i}`,
				unit,
				unitPrice: 100,
				stock,
			})),
		);
		const levels = await db
			.select({
				stock: material.stock,
				unit: material.unit,
				level: stockLevelSql(material.stock, material.unit),
			})
			.from(material)
			.orderBy(material.id);
		expect(levels.map((row) => row.level)).toEqual(
			cases.map(([stock, unit]) => stockLevel(stock, unit)),
		);
		expect(new Set(levels.map((row) => row.level))).toEqual(new Set(["out", "low", "in_stock"]));
	});
});
