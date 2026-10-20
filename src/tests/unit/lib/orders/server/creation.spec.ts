import { rmSync } from "node:fs";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { createOrders, type OrderDraft } from "#lib/orders/server/creation.ts";
import { setOrderUnits } from "#lib/orders/server/units.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order, orderUnit } from "#lib/server/db/schema.ts";
import { Refused } from "#lib/server/refused.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();
const committed = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));
const unitParts = vi.fn(async (_change: unknown) => {});
vi.mock("#lib/orders/server/hooks.ts", () => ({
	orderCommitted: (change: unknown) => committed(change),
	saveUnitParts: (change: unknown) => unitParts(change),
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
			customer_id integer not null, engineer_id integer,
			type text not null, status text not null, priority text not null,
			description text not null, scheduled_for integer, completed_at integer,
			labor_hours real not null default 0, created_at integer not null default (unixepoch())
		);
		create table order_unit (
			organization_id text not null, order_id integer not null, customer_id integer not null,
			equipment_id integer not null, position integer not null,
			primary key (order_id, equipment_id)
		);
		create unique index order_unit_order_position on order_unit (order_id, position);
		insert into customer values (1, 'north'), (2, 'north'), (3, 'south');
		insert into engineer values (1, 'north'), (2, 'south');
		insert into equipment values (10, 'north', 1), (11, 'north', 2), (12, 'south', 3),
			(13, 'north', 1), (14, 'north', 1);
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
	unitParts.mockClear();
	await db.delete(orderUnit);
	await db.delete(order);
});

const draft = (fields: Partial<OrderDraft> = {}): OrderDraft => ({
	customerId: 1,
	units: [10],
	type: "maintenance",
	description: "Annual boiler service",
	...fields,
});

const year = new Date().getFullYear();

/** The units on the orders, in the orders' order and theirs. */
const unitsOnOrders = () =>
	db
		.select({
			number: order.number,
			organizationId: orderUnit.organizationId,
			customerId: orderUnit.customerId,
			unit: orderUnit.equipmentId,
			position: orderUnit.position,
		})
		.from(orderUnit)
		.innerJoin(order, eq(order.id, orderUnit.orderId))
		.orderBy(order.id, orderUnit.position);

/** The reasons `createOrders()` refused `drafts` for, or `[]` if it didn't. */
async function refusal(drafts: OrderDraft[]) {
	try {
		await db.transaction((tx) => createOrders(tx, drafts));
		return [];
	} catch (error) {
		if (!(error instanceof Refused)) throw error;
		return error.problems.map((problem) => problem.message);
	}
}

describe("createOrders", () => {
	test("numbers the orders in sequence, with the order form's defaults", async () => {
		const created = await db.transaction((tx) =>
			createOrders(tx, [draft(), draft({ units: [11], customerId: 2, type: "inspection" })]),
		);
		expect(created.map((o) => o.number)).toEqual([`ORD-${year}-00001`, `ORD-${year}-00002`]);
		const rows = await db
			.select({
				number: order.number,
				organizationId: order.organizationId,
				status: order.status,
				priority: order.priority,
				customerId: order.customerId,
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
				type: "maintenance",
			},
			{
				number: `ORD-${year}-00002`,
				organizationId: "north",
				status: "quote",
				priority: "normal",
				customerId: 2,
				type: "inspection",
			},
		]);
		expect(await unitsOnOrders()).toEqual([
			{
				number: `ORD-${year}-00001`,
				organizationId: "north",
				customerId: 1,
				unit: 10,
				position: 0,
			},
			{
				number: `ORD-${year}-00002`,
				organizationId: "north",
				customerId: 2,
				unit: 11,
				position: 0,
			},
		]);
		expect(created.map((o) => o.id)).toEqual(
			(await db.select({ id: order.id }).from(order).orderBy(order.id)).map((row) => row.id),
		);
	});

	test("puts several units on an order, in their order and each once", async () => {
		await db.transaction((tx) => createOrders(tx, [draft({ units: [14, 10, 13, 10] })]));
		expect((await unitsOnOrders()).map((row) => [row.unit, row.position])).toEqual([
			[14, 0],
			[10, 1],
			[13, 2],
		]);
		// Logged with them, by id in their order: the log names them.
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "created",
				after: expect.objectContaining({ equipmentIds: [14, 10, 13] }),
			}),
		);
	});

	test("continues the tenant's numbers, not another tenant's", async () => {
		locals.tenant = tenant("south");
		await db.transaction((tx) => createOrders(tx, [draft({ customerId: 3, units: [12] })]));
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
		const otherCustomer = "One of the units belongs to another customer";
		expect(await refusal([draft({ customerId: 3, units: [] })])).toEqual(["Unknown customer"]);
		expect(await refusal([draft({ units: [12] })])).toEqual([otherCustomer]);
		expect(await refusal([draft({ units: [11] })])).toEqual([otherCustomer]);
		// One such unit refuses the order, whatever the others; so does one that doesn't exist.
		expect(await refusal([draft({ units: [10, 12] })])).toEqual([otherCustomer]);
		expect(await refusal([draft({ units: [13, 999] })])).toEqual([otherCustomer]);
		expect(await refusal([draft({ engineerId: 2 })])).toEqual(["Unknown engineer"]);
		// One bad draft refuses the batch: nothing is created or logged.
		expect(await refusal([draft(), draft({ customerId: 3, units: [] })])).toEqual([
			"Unknown customer",
		]);
		expect(await db.select().from(order)).toEqual([]);
		expect(await db.select().from(orderUnit)).toEqual([]);
		expect(logged).not.toHaveBeenCalled();
		expect(committed).not.toHaveBeenCalled();
	});

	test("accepts an order without units or engineer", async () => {
		const [created] = await db.transaction((tx) =>
			createOrders(tx, [draft({ units: [], engineerId: 1 }), draft({ units: undefined })]),
		);
		const [row] = await db.select().from(order).where(eq(order.id, created.id));
		expect(row).toMatchObject({ engineerId: 1 });
		expect(await unitsOnOrders()).toEqual([]);
	});
});

describe("setOrderUnits", () => {
	/** The units of the order, in their order, with the rowid each row has. */
	const unitRows = (orderId: number) =>
		db.$client
			.execute({
				sql: "select rowid, equipment_id, position from order_unit where order_id = ? order by position",
				args: [orderId],
			})
			.then((result) => result.rows.map((row) => [Number(row.equipment_id), Number(row.rowid)]));

	test("keeps the rows of the units it keeps, in their new places", async () => {
		const [{ id }] = await db.transaction((tx) => createOrders(tx, [draft({ units: [10, 13] })]));
		const [[, ten], [, thirteen]] = await unitRows(id);
		await db.transaction((tx) => setOrderUnits(tx, { id, customerId: 1 }, [14, 13, 10]));
		const after = await unitRows(id);
		expect(after.map(([unit]) => unit)).toEqual([14, 13, 10]);
		expect(after[1][1]).toBe(thirteen);
		expect(after[2][1]).toBe(ten);
		expect((await unitsOnOrders()).map((row) => row.position)).toEqual([0, 1, 2]);
	});

	test("lets the modules save their part once the new units are in, before the old ones go", async () => {
		const [{ id }] = await db.transaction((tx) => createOrders(tx, [draft({ units: [10, 13] })]));
		expect(unitParts).toHaveBeenLastCalledWith(
			expect.objectContaining({ order: { id }, equipmentIds: [10, 13], removed: [] }),
		);
		const seen: number[][] = [];
		unitParts.mockImplementationOnce(async (change) => {
			// In the transaction, which another connection doesn't see into.
			const { tx } = change as { tx: typeof db };
			const units = await tx
				.select({ unit: orderUnit.equipmentId })
				.from(orderUnit)
				.where(eq(orderUnit.orderId, id));
			seen.push(units.map((row) => row.unit).toSorted((a, b) => a - b));
		});
		await db.transaction((tx) => setOrderUnits(tx, { id, customerId: 1 }, [14, 13]));
		expect(unitParts).toHaveBeenLastCalledWith(
			expect.objectContaining({ equipmentIds: [14, 13], removed: [10] }),
		);
		// 14 is in, 10 still there while the modules look.
		expect(seen).toEqual([[10, 13, 14]]);
		expect((await unitRows(id)).map(([unit]) => unit)).toEqual([14, 13]);
	});

	test("changes nothing when a module refuses", async () => {
		const [{ id }] = await db.transaction((tx) => createOrders(tx, [draft({ units: [10, 13] })]));
		unitParts.mockRejectedValueOnce(new Error("refused"));
		await expect(
			db.transaction((tx) => setOrderUnits(tx, { id, customerId: 1 }, [14])),
		).rejects.toThrow("refused");
		expect((await unitRows(id)).map(([unit]) => unit)).toEqual([10, 13]);
	});
});
