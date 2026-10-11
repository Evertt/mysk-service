import { rmSync } from "node:fs";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { customer } from "#lib/server/db/schema.ts";
import { deleteAndLog } from "#lib/server/records.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the tables deleting touches, instead of the app's. Not an
// in-memory one: libsql gives a transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "records-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table customer (id integer primary key, organization_id text not null, code text not null);
		create table used (id integer primary key, customer_id integer references customer(id));
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

const tenantOf = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules: [],
});

const customerIds = async () =>
	(await db.all<{ id: number }>(sql`select id from customer order by id`)).map((row) => row.id);

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenantOf("north");
	await db.run(sql`delete from used`);
	await db.run(sql`delete from customer`);
	await db.run(sql`delete from activity`);
	await db.run(sql`insert into customer (id, organization_id, code) values
		(1, 'north', 'CUST-0001'), (2, 'north', 'CUST-0002'), (3, 'south', 'CUST-0003')`);
});

describe("deleteAndLog", () => {
	test("deletes the record and logs it, in the tenant", async () => {
		await deleteAndLog(customer, { type: "customer", id: 1, label: "CUST-0001" }, "In use");
		expect(await customerIds()).toEqual([2, 3]);
		expect(
			await db.all(
				sql`select organization_id, user_id, action, subject_type, subject_id, subject_label from activity`,
			),
		).toEqual([
			{
				organization_id: "north",
				user_id: "u1",
				action: "deleted",
				subject_type: "customer",
				subject_id: "1",
				subject_label: "CUST-0001",
			},
		]);
	});

	test("leaves another tenant's record alone", async () => {
		await deleteAndLog(customer, { type: "customer", id: 3, label: "CUST-0003" }, "In use");
		expect(await customerIds()).toEqual([1, 2, 3]);
	});

	test("refuses with the message, and logs nothing, while rows still refer to it", async () => {
		await db.run(sql`insert into used (customer_id) values (1)`);
		const attempt = deleteAndLog(
			customer,
			{ type: "customer", id: 1, label: "CUST-0001" },
			"In use",
		);
		await expect(attempt).rejects.toHaveProperty("issues", [{ message: "In use" }]);
		expect(await customerIds()).toEqual([1, 2, 3]);
		expect(await db.all(sql`select id from activity`)).toEqual([]);
	});
});
