import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { recordOrderLines } from "#lib/materials/server/lines.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the tables the lines' log touches, instead of the app's. Not an
// in-memory one: libsql gives a transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "lines-spec-"));
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
		create table activity (
			id integer primary key, organization_id text not null, user_id text,
			user_name text not null, action text not null, subject_type text not null,
			subject_id text not null, subject_label text not null, parent_type text, parent_id text,
			parent_label text, changes text, note text,
			created_at integer not null default (unixepoch())
		);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant: Tenant = {
	organizationId: "north",
	name: "north",
	slug: "north",
	roles: ["member"],
	modules: ["materials"],
};

/** Runs `work` in a transaction, like the app does. */
const inTransaction = <T>(work: (tx: Transaction) => Promise<T>) =>
	db.transaction((tx) => work(tx as unknown as Transaction));

/** The log as stored, oldest first. */
async function log() {
	const { rows } = await db.$client.execute(
		"select action, subject_type, subject_id, subject_label, parent_type, parent_id, parent_label, changes from activity order by id",
	);
	return (rows as unknown as Record<string, unknown>[]).map((row): Record<string, unknown> => ({
		...row,
		changes: typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes,
	}));
}

beforeEach(async () => {
	Object.assign(locals, { user: { id: "u1", name: "Avery Admin" }, tenant });
	await db.$client.executeMultiple(`
		delete from activity;
		delete from material;
		insert into material values (1, 'north', 'MAT-0001', 'Copper pipe', 'm', 900, 10);
		insert into material values (2, 'north', 'MAT-0002', 'Ball valve', 'pcs', 1800, 5);
		insert into material values (3, 'south', 'MAT-0001', 'Gasket', 'pcs', 100, 5);
	`);
});

describe("recordOrderLines", () => {
	const order = { type: "order", id: 5, label: "ORD-2026-00005" };

	test("logs added, removed and changed materials against the order", async () => {
		await inTransaction((tx) =>
			recordOrderLines(
				tx,
				order,
				[
					{ materialId: 1, quantity: 2 },
					{ materialId: 2, quantity: 1 },
				],
				[
					// Two lines of the same material count together.
					{ materialId: 1, quantity: 1.5 },
					{ materialId: 1, quantity: 1 },
					{ materialId: 3, quantity: 4 },
				],
			),
		);
		const entries = (await log()).map((row) => ({
			action: row.action,
			subject: `${String(row.subject_type)}:${String(row.subject_id)}:${String(row.subject_label)}`,
			parent: `${String(row.parent_type)}:${String(row.parent_id)}:${String(row.parent_label)}`,
			changes: row.changes,
		}));
		expect(entries).toEqual([
			{
				action: "updated",
				subject: "order_line:1:Copper pipe",
				parent: "order:5:ORD-2026-00005",
				changes: { quantity: [2, 2.5] },
			},
			{
				action: "deleted",
				subject: "order_line:2:Ball valve",
				parent: "order:5:ORD-2026-00005",
				changes: { quantity: [1, null] },
			},
			// Another tenant's material isn't named.
			{
				action: "created",
				subject: "order_line:3:#3",
				parent: "order:5:ORD-2026-00005",
				changes: { quantity: [null, 4] },
			},
		]);
	});

	test("logs nothing when the lines stay the same", async () => {
		await inTransaction((tx) =>
			recordOrderLines(
				tx,
				order,
				[{ materialId: 1, quantity: 2 }],
				[
					{ materialId: 1, quantity: 1 },
					{ materialId: 1, quantity: 1 },
				],
			),
		);
		expect(await log()).toEqual([]);
	});
});
