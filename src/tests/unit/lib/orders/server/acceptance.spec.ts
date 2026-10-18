import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { requestOrder } from "#lib/orders/server/acceptance.ts";
import { assignOrder } from "#lib/orders/server/order-changes.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order, orderRequest, orderUnit } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();
const parts = vi.fn(async (_change: unknown) => {});

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));
vi.mock("#lib/orders/server/hooks.ts", () => ({
	OrderRefused: class extends Error {},
	saveOrderParts: (change: unknown) => parts(change),
	saveUnitParts: async () => {},
}));

// A temporary database with the tables the services touch (see `creation.spec.ts`).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "acceptance-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table customer (id integer primary key, organization_id text not null);
		create table engineer (
			id integer primary key, organization_id text not null, name text not null,
			active integer not null default 1
		);
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
		create table order_request (
			order_id integer primary key, organization_id text not null, user_id text,
			reporter_name text not null, decided_at integer, decided_by text, rejection_reason text
		);
		insert into customer values (1, 'north'), (3, 'south');
		insert into engineer values (1, 'north', 'Eli', 1), (2, 'south', 'Sam', 1);
		insert into equipment values (10, 'north', 1), (12, 'south', 3);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string, roles = ["member"]): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles,
	modules: [],
});

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	parts.mockClear();
	await db.delete(orderRequest);
	await db.delete(orderUnit);
	await db.delete(order);
});

/** A breakdown reported by the customer's contact Cas, in North. */
async function reported() {
	locals.user = { id: "c1", name: "Cas" };
	locals.tenant = tenant("north", ["customer"]);
	const created = await db.transaction((tx) =>
		requestOrder(tx, {
			customerId: 1,
			units: [10],
			type: "breakdown",
			priority: "urgent",
			description: "Deur gaat niet open",
		}),
	);
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	parts.mockClear();
	return created;
}

const stored = async (id: number) => {
	const [found] = await db
		.select({
			status: order.status,
			engineerId: order.engineerId,
			scheduledFor: order.scheduledFor,
			decidedAt: orderRequest.decidedAt,
			decidedBy: orderRequest.decidedBy,
			reporterName: orderRequest.reporterName,
			rejectionReason: orderRequest.rejectionReason,
		})
		.from(order)
		.leftJoin(orderRequest, eq(orderRequest.orderId, order.id))
		.where(eq(order.id, id));
	return found;
};

/** The reasons a change was refused for, or its HTTP status. */
async function refusal(change: () => Promise<unknown>) {
	try {
		await change();
	} catch (error) {
		if (isValidationError(error)) return error.issues.map((issue) => issue.message);
		if (isHttpError(error)) return error.status;
		throw error;
	}
	return [];
}

describe("a customer's report", () => {
	test("is a new order awaiting acceptance, with who reported it", async () => {
		const { id } = await reported();
		expect(await stored(id)).toMatchObject({
			status: "awaiting_acceptance",
			reporterName: "Cas",
			decidedAt: null,
		});
	});

	test("can't be given an engineer before it's accepted", async () => {
		const { id, number } = await reported();
		expect(await refusal(() => assignOrder(id, 1))).toEqual([
			`Accept or reject order ${number} first.`,
		]);
		expect((await stored(id)).status).toBe("awaiting_acceptance");
	});
});
