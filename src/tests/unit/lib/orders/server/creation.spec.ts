import { rmSync } from "node:fs";

import { isValidationError } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createOrders, type OrderDraft } from "#lib/orders/server/creation.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();
const committed = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));
vi.mock("#lib/orders/server/hooks.ts", () => ({
	orderCommitted: (change: unknown) => committed(change),
}));

// A temporary database with the tables the service touches. Not an in-memory one: libsql gives a
// transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "creation-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table customer (id integer primary key, organization_id text not null);
		create table engineer (id integer primary key, organization_id text not null);
		create table equipment (
			id integer primary key, organization_id text not null, customer_id integer not null
		);
		create table "order" (
			id integer primary key, organization_id text not null, number text not null,
			customer_id integer not null, equipment_id integer, engineer_id integer,
			type text not null, status text not null, priority text not null,
			description text not null, scheduled_for integer, completed_at integer,
			labor_hours real not null default 0, created_at integer not null default (unixepoch())
		);
		insert into customer values (1, 'north'), (2, 'north'), (3, 'south');
		insert into engineer values (1, 'north'), (2, 'south');
		insert into equipment values (10, 'north', 1), (11, 'north', 2), (12, 'south', 3);
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

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	committed.mockClear();
	await db.delete(order);
});

const draft = (fields: Partial<OrderDraft> = {}): OrderDraft => ({
	customerId: 1,
	equipmentId: 10,
	type: "maintenance",
	description: "Annual boiler service",
	...fields,
});

const year = new Date().getFullYear();

/** The reasons `createOrders()` refused `drafts` for, or `[]` if it didn't. */
async function refusal(drafts: OrderDraft[]) {
	try {
		await db.transaction((tx) => createOrders(tx, drafts));
		return [];
	} catch (error) {
		if (!isValidationError(error)) throw error;
		return error.issues.map((issue) => issue.message);
	}
}

describe("createOrders", () => {
	test("numbers the orders in sequence, with the order form's defaults", async () => {
		const created = await db.transaction((tx) =>
			createOrders(tx, [draft(), draft({ equipmentId: 11, customerId: 2, type: "inspection" })]),
		);
		expect(created.map((o) => o.number)).toEqual([`ORD-${year}-00001`, `ORD-${year}-00002`]);
		const rows = await db
			.select({
				number: order.number,
				organizationId: order.organizationId,
				status: order.status,
				priority: order.priority,
				customerId: order.customerId,
				equipmentId: order.equipmentId,
				type: order.type,
			})
			.from(order)
			.orderBy(order.id);
		expect(rows).toEqual([
			{
				number: `ORD-${year}-00001`,
				organizationId: "north",
				status: "quote",
				priority: "normal",
				customerId: 1,
				equipmentId: 10,
				type: "maintenance",
			},
			{
				number: `ORD-${year}-00002`,
				organizationId: "north",
				status: "quote",
				priority: "normal",
				customerId: 2,
				equipmentId: 11,
				type: "inspection",
			},
		]);
		expect(created.map((o) => o.id)).toEqual(
			(await db.select({ id: order.id }).from(order).orderBy(order.id)).map((row) => row.id),
		);
	});

	test("continues the tenant's numbers, not another tenant's", async () => {
		locals.tenant = tenant("south");
		await db.transaction((tx) => createOrders(tx, [draft({ customerId: 3, equipmentId: 12 })]));
		locals.tenant = tenant("north");
		const [created] = await db.transaction((tx) => createOrders(tx, [draft()]));
		expect(created.number).toBe(`ORD-${year}-00001`);
	});

	test("logs each order as created, without the event for saved orders", async () => {
		await db.transaction(async (tx) => {
			await createOrders(tx, [draft()]);
			expect(logged).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "created",
					subject: expect.objectContaining({ type: "order", label: `ORD-${year}-00001` }),
				}),
			);
		});
		// `orders.committed` refreshes what pages show of an order; a new one is on none yet.
		expect(committed).not.toHaveBeenCalled();
	});

	test("refuses another tenant's customer, unit or engineer, and a unit of another customer", async () => {
		expect(await refusal([draft({ customerId: 3, equipmentId: null })])).toEqual([
			"Unknown customer",
		]);
		expect(await refusal([draft({ equipmentId: 12 })])).toEqual([
			"This equipment belongs to another customer",
		]);
		expect(await refusal([draft({ equipmentId: 11 })])).toEqual([
			"This equipment belongs to another customer",
		]);
		expect(await refusal([draft({ engineerId: 2 })])).toEqual(["Unknown engineer"]);
		// One bad draft refuses the batch: nothing is created or logged.
		expect(await refusal([draft(), draft({ customerId: 3, equipmentId: null })])).toEqual([
			"Unknown customer",
		]);
		expect(await db.select().from(order)).toEqual([]);
		expect(logged).not.toHaveBeenCalled();
		expect(committed).not.toHaveBeenCalled();
	});

	test("accepts an order without a unit or engineer", async () => {
		const [created] = await db.transaction((tx) =>
			createOrders(tx, [draft({ equipmentId: null, engineerId: 1 })]),
		);
		const [row] = await db.select().from(order).where(eq(order.id, created.id));
		expect(row).toMatchObject({ equipmentId: null, engineerId: 1 });
	});
});
