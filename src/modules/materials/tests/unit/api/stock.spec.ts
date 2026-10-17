import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { releaseStock, reserveStock, StockShortage } from "#modules/materials/api/stock.server.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the tables the ledger touches (see `../server/stock.spec.ts`).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "reserve-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = {
		...(await import("#lib/server/db/schema.ts")),
		...(await import("#modules/materials/server/schema.ts")),
	};
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

const tenant: Tenant = {
	organizationId: "shltr",
	name: "SHLTR",
	slug: "shltr",
	roles: ["customer"],
	modules: [],
};

const inTransaction = <T>(work: (tx: Transaction) => Promise<T>) =>
	db.transaction((tx) => work(tx as unknown as Transaction));

async function ledger() {
	const [{ stock }] = (await db.$client.execute("select stock from material where id = 1"))
		.rows as unknown as { stock: number }[];
	const movements = (
		await db.$client.execute(
			"select quantity, kind, order_id, order_number, note from stock_movement order by id",
		)
	).rows.map((row) => ({ ...row }));
	return { stock, movements };
}

describe("a shop order's stock", () => {
	beforeEach(async () => {
		Object.assign(locals, { user: { id: "u1", name: "Riedel" }, tenant });
		await db.$client.executeMultiple(`
			delete from stock_movement;
			delete from material;
			insert into material values (1, 'shltr', 'SD-005', 'Openingsbeveiliging sensor', 'pcs', 12000, 3);
			insert into material values (2, 'north', 'SD-005', 'Elsewhere', 'pcs', 12000, 30);
		`);
	});

	test("is set aside with the order's number in the note, and released again", async () => {
		await inTransaction((tx) => reserveStock(tx, 1, 2, "SH-2026-012"));
		expect(await ledger()).toEqual({
			stock: 1,
			movements: [
				{
					quantity: -2,
					kind: "reservation",
					order_id: null,
					order_number: null,
					note: "SH-2026-012",
				},
			],
		});
		await inTransaction((tx) => releaseStock(tx, 1, 2, "SH-2026-012"));
		expect((await ledger()).stock).toBe(3);
		expect((await ledger()).movements.map((movement) => movement.kind)).toEqual([
			"reservation",
			"release",
		]);
	});

	test("can't take more than there is, and changes nothing then", async () => {
		await expect(inTransaction((tx) => reserveStock(tx, 1, 4, "SH-2026-012"))).rejects.toThrow(
			StockShortage,
		);
		expect(await ledger()).toEqual({ stock: 3, movements: [] });
	});

	test("is only the tenant's own material's", async () => {
		await expect(
			inTransaction((tx) => reserveStock(tx, 2, 1, "SH-2026-012")),
		).rejects.toMatchObject({ status: 404 });
	});
});
