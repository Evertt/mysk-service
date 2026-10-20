import { rmSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, equipmentCategory } from "#lib/server/db/schema.ts";
import {
	defineRemoval,
	deleteAndLog,
	lookupBy,
	nameTaken,
	nextPosition,
	reorder,
} from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

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
		create table equipment_category (
			id integer primary key, organization_id text not null, name text not null,
			specialty text, position integer not null, created_at integer not null default (unixepoch())
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
	await db.run(sql`delete from equipment_category`);
	// North's with a gap and a tie in their places, and South's.
	await db.run(sql`insert into equipment_category (id, organization_id, name, position) values
		(10, 'north', 'Pomp', 1), (11, 'north', 'Lift', 4), (12, 'north', 'Deur', 4),
		(20, 'south', 'Ketel', 7)`);
	await db.run(sql`insert into customer (id, organization_id, code) values
		(1, 'north', 'CUST-0001'), (2, 'north', 'CUST-0002'), (3, 'south', 'CUST-0003')`);
});

describe("deleteAndLog", () => {
	test("deletes the record and logs it, in the tenant", async () => {
		await deleteAndLog(customer, {
			subject: { type: "customer", id: 1, label: "CUST-0001" },
			referenced: "In use",
		});
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
		await deleteAndLog(customer, {
			subject: { type: "customer", id: 3, label: "CUST-0003" },
			referenced: "In use",
		});
		expect(await customerIds()).toEqual([1, 2, 3]);
	});

	test("refuses with the message, and logs nothing, while rows still refer to it", async () => {
		await db.run(sql`insert into used (customer_id) values (1)`);
		const attempt = deleteAndLog(customer, {
			subject: { type: "customer", id: 1, label: "CUST-0001" },
			referenced: "In use",
		});
		await expect(attempt).rejects.toThrow(Refused);
		await expect(attempt).rejects.toHaveProperty("problems", [{ message: "In use" }]);
		expect(await customerIds()).toEqual([1, 2, 3]);
		expect(await db.all(sql`select id from activity`)).toEqual([]);
	});
});

/** The refusal a promise rejected with: its messages, its status for an HTTP error. */
async function refusal(work: Promise<unknown>) {
	try {
		await work;
	} catch (error) {
		if (error instanceof Refused) return error.problems.map((problem) => problem.message);
		return (error as { status?: number }).status;
	}
	throw new Error("Not refused");
}

describe("defineRemoval", () => {
	const removeCustomer = defineRemoval({
		table: customer,
		find: (tx, id) =>
			tx
				.select({ id: customer.id, code: customer.code })
				.from(customer)
				.where(sql`${customer.id} = ${id} and ${customer.organizationId} = 'north'`)
				.then(([found]) => found),
		notFound: () => "No such customer",
		subject: (found) => ({ type: "customer", id: found.id, label: found.code }),
		blockers: async (found) => (found.code === "CUST-0002" ? "Has orders" : undefined),
		referenced: () => "Still referred to",
	});

	test("deletes the record and logs it", async () => {
		await removeCustomer(1);
		expect(await customerIds()).toEqual([2, 3]);
		expect(await db.all(sql`select action, subject_id from activity`)).toEqual([
			{ action: "deleted", subject_id: "1" },
		]);
	});

	test("refuses what the blockers name, and a record rows refer to, logging nothing", async () => {
		expect(await refusal(removeCustomer(2))).toEqual(["Has orders"]);
		await db.run(sql`insert into used (customer_id) values (1)`);
		expect(await refusal(removeCustomer(1))).toEqual(["Still referred to"]);
		expect(await customerIds()).toEqual([1, 2, 3]);
		expect(await db.all(sql`select id from activity`)).toEqual([]);
	});

	test("is a 404 for a record it doesn't find", async () => {
		expect(await refusal(removeCustomer(3))).toBe(404);
	});
});

describe("lookupBy", () => {
	const byCode = lookupBy(customer, customer.code, { id: customer.id }, (code) => `No ${code}`);

	test("finds the tenant's record by its key, with the fields asked for", async () => {
		expect(await byCode("CUST-0002")).toEqual({ id: 2 });
		expect(await byCode("CUST-0002", { code: customer.code })).toEqual({ code: "CUST-0002" });
		const joined = await byCode("CUST-0001", (where) =>
			db.select({ id: customer.id }).from(customer).where(where),
		);
		expect(joined).toEqual({ id: 1 });
	});

	test("is a 404 for another tenant's record, with its message", async () => {
		await expect(byCode("CUST-0003")).rejects.toMatchObject({
			status: 404,
			body: { message: "No CUST-0003" },
		});
	});
});

describe("ordered records", () => {
	const places = () =>
		db
			.select({ id: equipmentCategory.id, position: equipmentCategory.position })
			.from(equipmentCategory)
			.where(eq(equipmentCategory.organizationId, "north"))
			.orderBy(equipmentCategory.position, equipmentCategory.id);

	test("nextPosition is after the tenant's last, 0 for the first", async () => {
		expect(await nextPosition(db, equipmentCategory)).toBe(5);
		expect(await nextPosition(db, equipmentCategory, sql`0`)).toBe(0);
		locals.tenant = tenantOf("west");
		expect(await nextPosition(db, equipmentCategory)).toBe(0);
	});

	test("reorder moves one past its neighbour and numbers them afresh", async () => {
		const moved = await db.transaction((tx) => reorder(tx, equipmentCategory, 12, "up"));
		expect(moved).toEqual([
			{ id: 10, from: 1, to: 0 },
			{ id: 12, from: 4, to: 1 },
			{ id: 11, from: 4, to: 2 },
		]);
		expect(await places()).toEqual([
			{ id: 10, position: 0 },
			{ id: 12, position: 1 },
			{ id: 11, position: 2 },
		]);
	});

	test("reorder changes nothing at the ends, or for another tenant's", async () => {
		expect(await db.transaction((tx) => reorder(tx, equipmentCategory, 10, "up"))).toEqual([]);
		expect(await db.transaction((tx) => reorder(tx, equipmentCategory, 20, "down"))).toEqual([]);
		expect(await places()).toEqual([
			{ id: 10, position: 1 },
			{ id: 11, position: 4 },
			{ id: 12, position: 4 },
		]);
	});

	test("nameTaken finds the tenant's same name in any ASCII case, but the one renamed", async () => {
		expect(await nameTaken(db, equipmentCategory, "LIFT")).toMatchObject({ id: 11, name: "Lift" });
		expect(await nameTaken(db, equipmentCategory, "lift", { except: 11 })).toBeUndefined();
		expect(await nameTaken(db, equipmentCategory, "Ketel")).toBeUndefined();
	});
});
