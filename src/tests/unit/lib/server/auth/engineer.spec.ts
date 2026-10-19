/**
 * The engineer portal's scope, on the seeded demo database, as North's field engineer (Erik): the
 * orders they reach are the tenant's assigned to them, by id or by number; another engineer's
 * order, South's and a missing one all read as the same 404, with the order's number when the
 * request named it. The portal and the modules build on it (their specs keep one wiring case).
 */
import { isHttpError } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeAll, describe, expect, test } from "vite-plus/test";

import {
	engineerOrder,
	engineerOrderNotFound,
	engineerOrders,
	type OrderRef,
} from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order } from "#lib/server/db/schema.ts";
import { as, north, organizationId, rows, value } from "#unit/lib/server/harness/index.ts";

const [northId, southId] = [organizationId("north"), organizationId("south")];
const erik = north.engineer;

interface Order {
	id: number;
	number: string;
}

let mine: number;
/** An order of Erik's, another North engineer's, and one of South's. */
let own: Order;
let others: Order;
let southern: Order;

beforeAll(async () => {
	mine = await value<number>(
		`select e.id from engineer e join user u on u.id = e.user_id where u.email = ?
		 and e.organization_id = ?`,
		[erik.email, northId],
	);
	const first = (where: string, args: (string | number)[]) =>
		rows<Order>(`select id, number from "order" where ${where} order by id limit 1`, args).then(
			([found]) => found,
		);
	own = await first("engineer_id = ?", [mine]);
	others = await first("organization_id = ? and engineer_id <> ?", [northId, mine]);
	// By a number none of Erik's orders has (numbers repeat across tenants).
	southern = await first(
		`organization_id = ? and engineer_id is not null and not exists
		 (select 1 from "order" s where s.engineer_id = ? and s.number = "order".number)`,
		[southId, mine],
	);
	expect([own, others, southern].every(Boolean)).toBe(true);
});

/** The orders a query scoped to `ref` finds, as Erik. */
const reached = (ref: OrderRef) =>
	as(erik, async () =>
		db
			.select({ id: order.id })
			.from(order)
			.where(await engineerOrder(ref))
			.then((found) => found.map((row) => row.id)),
	);

/** What `engineerOrderNotFound(ref)` throws: its status and message. */
function refusal(ref: OrderRef) {
	try {
		engineerOrderNotFound(ref);
	} catch (thrown) {
		if (isHttpError(thrown)) return { status: thrown.status, message: thrown.body.message };
		throw thrown;
	}
	throw new Error("engineerOrderNotFound() didn't refuse");
}

describe("engineerOrders()", () => {
	test("is the tenant's orders assigned to the signed-in engineer", async () => {
		const ids = await as(erik, async () =>
			db
				.select({ id: order.id })
				.from(order)
				.where(await engineerOrders())
				.then((found) => found.map((row) => row.id).toSorted((a, b) => a - b)),
		);
		const theirs = await rows<{ id: number }>(
			`select id from "order" where organization_id = ? and engineer_id = ? order by id`,
			[northId, mine],
		);
		expect(ids).toEqual(theirs.map((row) => row.id));
		expect(ids.length).toBeGreaterThan(0);
	});

	test("composes with the rest of a query", async () => {
		const found = await as(erik, async () =>
			db
				.select({ id: order.id })
				.from(order)
				.where(and(await engineerOrders(), eq(order.number, others.number))),
		);
		expect(found).toEqual([]);
	});
});

describe("engineerOrder(ref)", () => {
	test("reaches their own order, by id and by number", async () => {
		expect(await reached({ id: own.id })).toEqual([own.id]);
		expect(await reached({ number: own.number })).toEqual([own.id]);
	});

	test("doesn't reach another engineer's order, South's, or a missing one, by id or by number", async () => {
		for (const stranger of [others, southern]) {
			expect(await reached({ id: stranger.id }), stranger.number).toEqual([]);
			expect(await reached({ number: stranger.number }), stranger.number).toEqual([]);
		}
		expect(await reached({ id: 0 })).toEqual([]);
		expect(await reached({ number: "ORD-0000-00000" })).toEqual([]);
	});
});

describe("the conditions", () => {
	const dialect = new SQLiteSyncDialect();

	test("are the tenant's and the engineer's, and the order's id or number", async () => {
		const [orders, byId, byNumber] = await as(erik, async () => [
			dialect.sqlToQuery(await engineerOrders()),
			dialect.sqlToQuery(await engineerOrder({ id: 7 })),
			dialect.sqlToQuery(await engineerOrder({ number: "ORD-1" })),
		]);
		expect(orders).toMatchObject({
			sql: '("order"."organization_id" = ? and "order"."engineer_id" = ?)',
			params: [northId, mine],
		});
		expect(byId).toMatchObject({
			sql: '("order"."id" = ? and ("order"."organization_id" = ? and "order"."engineer_id" = ?))',
			params: [7, northId, mine],
		});
		expect(byNumber).toMatchObject({
			sql: '("order"."number" = ? and ("order"."organization_id" = ? and "order"."engineer_id" = ?))',
			params: ["ORD-1", northId, mine],
		});
	});
});

describe("engineerOrderNotFound(ref)", () => {
	test("is a 404 naming the order's number when the request named it", async () => {
		expect(await as(erik, () => refusal({ number: "ORD-2026-00042" }))).toEqual({
			status: 404,
			message: "Order ORD-2026-00042 not found",
		});
	});

	test("is a plain 404 for an order named by its id", async () => {
		expect(await as(erik, () => refusal({ id: 42 }))).toEqual({
			status: 404,
			message: "Order not found",
		});
	});
});
