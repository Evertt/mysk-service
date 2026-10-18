/**
 * Moving an order from one status to another (`transitionOrder()`), by each verb of the
 * transition table: what it stores, the completion date, whether the modules are asked, the one
 * activity entry, its refusals and the tenant's scope. On a small database of the tables it
 * touches, with the modules' save hook and the activity log recorded rather than run.
 */
import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { overwriteGetTimeZone } from "#lib/dates.ts";
import type { OrderStatus } from "#lib/models.ts";
import { transitionOrder } from "#lib/orders/server/lifecycle.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order, orderRequest } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();
const parts = vi.fn(async (_change: unknown) => {});

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));
vi.mock("#lib/orders/server/hooks.ts", () => ({
	OrderRefused: class extends Error {
		constructor(readonly problems: { message: string }[]) {
			super(problems.map((problem) => problem.message).join(" "));
		}
	},
	saveOrderParts: (change: unknown) => parts(change),
	saveUnitParts: async () => {},
}));

// A temporary database with the tables the moves touch (see `acceptance.spec.ts`).
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "lifecycle-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table engineer (
			id integer primary key, organization_id text not null, name text not null,
			active integer not null default 1, user_id text
		);
		create table "order" (
			id integer primary key, organization_id text not null, number text not null,
			customer_id integer not null, engineer_id integer,
			type text not null, status text not null, priority text not null,
			description text not null, scheduled_for integer, completed_at integer,
			labor_hours real not null default 0, created_at integer not null default (unixepoch())
		);
		create table order_request (
			order_id integer primary key, organization_id text not null, user_id text,
			reporter_name text not null, decided_at integer, decided_by text, rejection_reason text
		);
		insert into engineer values (1, 'north', 'Eli', 1, 'e1'), (2, 'south', 'Sam', 1, null),
			(3, 'north', 'Ina', 0, null);
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

overwriteGetTimeZone(() => "Europe/Amsterdam");

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	parts.mockClear();
	parts.mockImplementation(async () => {});
	await db.delete(orderRequest);
	await db.delete(order);
});

let numbers = 0;

/** An order of North's (or `organizationId`'s) in `status`. */
async function orderIn(
	status: OrderStatus,
	{
		organizationId = "north",
		completedAt = null as Temporal.Instant | null,
	}: { organizationId?: string; completedAt?: Temporal.Instant | null } = {},
) {
	const number = `O-${++numbers}`;
	const [created] = await db
		.insert(order)
		.values({
			organizationId,
			number,
			customerId: 1,
			type: "repair",
			status,
			priority: "normal",
			description: "Deur klemt",
			completedAt,
		})
		.returning({ id: order.id, number: order.number });
	return created;
}

const stored = async (id: number) =>
	(
		await db
			.select({
				status: order.status,
				completedAt: order.completedAt,
				engineerId: order.engineerId,
				scheduledFor: order.scheduledFor,
			})
			.from(order)
			.where(eq(order.id, id))
	)[0];

/** The reasons a move was refused for, its HTTP status, or what else it threw. */
async function refusal(move: () => Promise<unknown>) {
	try {
		await move();
	} catch (error) {
		if (isValidationError(error)) return error.issues.map((issue) => issue.message);
		if (isHttpError(error)) return error.status;
		// Anything else is no refusal the caller can show.
		return { thrown: String(error) };
	}
	return [];
}

describe("set: the office gives an order a status by hand", () => {
	test("stores it with its completion date, asks the modules, and logs it as updated", async () => {
		const { id, number } = await orderIn("in_progress");
		const moved = await db.transaction((tx) =>
			transitionOrder(tx, { verb: "set", id, to: "completed" }),
		);
		expect(moved).toEqual({ id, number });
		const after = await stored(id);
		expect(after.status).toBe("completed");
		expect(after.completedAt).not.toBeNull();
		expect(parts).toHaveBeenCalledWith(
			expect.objectContaining({ order: expect.objectContaining({ id }), status: "completed" }),
		);
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "updated",
				subject: { type: "order", id, label: number },
				before: expect.objectContaining({ status: "in_progress" }),
				after: expect.objectContaining({ status: "completed" }),
				ignore: ["completedAt"],
			}),
		);
	});
});

describe("set: refusals", () => {
	test("another tenant's order is a 404, also by its id, and stays as it was", async () => {
		const { id } = await orderIn("quote", { organizationId: "south" });
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "scheduled" })),
			),
		).toBe(404);
		expect((await stored(id)).status).toBe("quote");
	});

	test("an invoiced order stays as it was invoiced", async () => {
		const { id, number } = await orderIn("invoiced");
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "completed" })),
			),
		).toEqual([
			`${number} is invoiced: it's on an invoice that has been sent, so it can't be changed`,
		]);
		expect((await stored(id)).status).toBe("invoiced");
		expect(logged).not.toHaveBeenCalled();
	});

	test("an order awaiting acceptance is accepted or rejected first", async () => {
		const { id, number } = await orderIn("awaiting_acceptance");
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "scheduled" })),
			),
		).toEqual([`Accept or reject order ${number} first.`]);
		expect((await stored(id)).status).toBe("awaiting_acceptance");
	});
});

describe("set: what follows", () => {
	test("giving an order the status it has changes nothing, asks no module, logs nothing", async () => {
		const { id } = await orderIn("scheduled");
		await db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "scheduled" }));
		expect(parts).not.toHaveBeenCalled();
		expect(logged).not.toHaveBeenCalled();
	});

	test("a done order that's set back to open work loses its completion date", async () => {
		const done = Temporal.Instant.from("2026-10-01T10:00:00Z");
		const { id } = await orderIn("completed", { completedAt: done });
		await db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "scheduled" }));
		expect(await stored(id)).toMatchObject({ status: "scheduled", completedAt: null });
	});

	test("a module's refusal refuses the move with its message, and stores none of it", async () => {
		const { OrderRefused } = await import("#lib/orders/server/hooks.ts");
		parts.mockImplementation(async () => {
			throw new OrderRefused([{ message: "Not enough Scharnier in stock." }]);
		});
		const { id } = await orderIn("quote");
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "set", id, to: "scheduled" })),
			),
		).toEqual(["Not enough Scharnier in stock."]);
		expect((await stored(id)).status).toBe("quote");
		expect(logged).not.toHaveBeenCalled();
	});
});

describe("plan: the planner gives an open order an engineer and a time", () => {
	const plan = (id: number, engineerId: number | null, time = "13:30") =>
		db.transaction((tx) =>
			transitionOrder(tx, {
				verb: "plan",
				id,
				engineerId,
				day: Temporal.PlainDate.from("2026-11-03"),
				time,
			}),
		);

	test("a quote that gets an engineer is scheduled then, in the planner's zone; logged", async () => {
		const { id, number } = await orderIn("quote");
		expect(await plan(id, 1)).toEqual({ id, number });
		expect(await stored(id)).toEqual({
			status: "scheduled",
			engineerId: 1,
			scheduledFor: Temporal.Instant.from("2026-11-03T12:30:00Z"),
			completedAt: null,
		});
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled" }));
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "scheduled",
				subject: { type: "order", id, label: number },
				after: expect.objectContaining({ status: "scheduled", engineerId: 1 }),
			}),
		);
	});

	test("only open orders are planned", async () => {
		const { id } = await orderIn("completed");
		expect(await refusal(() => plan(id, 1))).toEqual(["Only open orders can be scheduled"]);
		expect((await stored(id)).engineerId).toBeNull();
	});

	test("refuses another tenant's engineer, and an inactive one, at the engineer field", async () => {
		const { id } = await orderIn("quote");
		const issues = async (engineerId: number) => {
			try {
				await plan(id, engineerId);
			} catch (error) {
				if (isValidationError(error)) return error.issues;
				throw error;
			}
			return [];
		};
		expect(await issues(2)).toMatchObject([{ message: "Unknown engineer", path: ["engineerId"] }]);
		expect(await issues(3)).toMatchObject([
			{ message: "Ina is no longer active", path: ["engineerId"] },
		]);
		expect((await stored(id)).status).toBe("quote");
	});

	test("a planned order planned again keeps its status, and is moved and logged again", async () => {
		const { id } = await orderIn("quote");
		await plan(id, 1);
		logged.mockClear();
		await plan(id, 1, "15:00");
		expect(await stored(id)).toMatchObject({
			status: "scheduled",
			scheduledFor: Temporal.Instant.from("2026-11-03T14:00:00Z"),
		});
		expect(logged).toHaveBeenCalledWith(expect.objectContaining({ action: "scheduled" }));
	});

	test("a quote planned without an engineer stays a quote, and keeps no completion date", async () => {
		const { id } = await orderIn("quote");
		await plan(id, null);
		expect(await stored(id)).toMatchObject({
			status: "quote",
			engineerId: null,
			completedAt: null,
		});
	});

	test("planning leaves the completion date as it is, even one an open order shouldn't have", async () => {
		const stale = Temporal.Instant.from("2026-09-01T08:00:00Z");
		const { id } = await orderIn("quote", { completedAt: stale });
		await plan(id, 1);
		expect((await stored(id)).completedAt).toEqual(stale);
	});
});

/** A breakdown a customer's contact (Cas) reported in the portal, awaiting acceptance. */
async function reported() {
	const created = await orderIn("awaiting_acceptance");
	await db
		.insert(orderRequest)
		.values({ orderId: created.id, organizationId: "north", userId: "c1", reporterName: "Cas" });
	return created;
}

const decision = async (id: number) =>
	(
		await db
			.select({
				decidedAt: orderRequest.decidedAt,
				decidedBy: orderRequest.decidedBy,
				rejectionReason: orderRequest.rejectionReason,
			})
			.from(orderRequest)
			.where(eq(orderRequest.orderId, id))
	)[0];

describe("accept: a planner accepts a customer's report", () => {
	test("makes it a quote, with the modules following, notes who decided, and logs it", async () => {
		const { id, number } = await reported();
		expect(await db.transaction((tx) => transitionOrder(tx, { verb: "accept", id }))).toEqual({
			id,
			number,
		});
		expect((await stored(id)).status).toBe("quote");
		const decided = await decision(id);
		expect(decided).toMatchObject({ decidedBy: "u1", rejectionReason: null });
		expect(decided.decidedAt).not.toBeNull();
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "quote" }));
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({ action: "accepted", after: { status: "quote" } }),
		);
	});

	test("plans it in the same step: with an engineer it's scheduled, logged as such", async () => {
		const { id } = await reported();
		const plan = { engineerId: 1, day: Temporal.PlainDate.from("2026-10-20"), time: "09:00" };
		await db.transaction((tx) => transitionOrder(tx, { verb: "accept", id, plan }));
		expect(await stored(id)).toMatchObject({ status: "scheduled", engineerId: 1 });
		expect(logged.mock.calls.map(([record]) => record.action)).toEqual(["accepted", "scheduled"]);
	});

	test("a plan that can't be made refuses the acceptance too: it stays awaiting", async () => {
		const { id } = await reported();
		const plan = { engineerId: 2, day: Temporal.PlainDate.from("2026-10-20"), time: "09:00" };
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "accept", id, plan })),
			),
		).toEqual(["Unknown engineer"]);
		expect((await stored(id)).status).toBe("awaiting_acceptance");
		expect((await decision(id)).decidedAt).toBeNull();
	});

	test("refuses an order that's decided already, and another tenant's", async () => {
		const { id, number } = await reported();
		await db.transaction((tx) => transitionOrder(tx, { verb: "accept", id }));
		expect(
			await refusal(() => db.transaction((tx) => transitionOrder(tx, { verb: "accept", id }))),
		).toEqual([`Order ${number} isn't awaiting acceptance any more.`]);
		const other = await reported();
		locals.tenant = tenant("south");
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "accept", id: other.id })),
			),
		).toBe(404);
	});
});

describe("reject: a planner rejects a customer's report", () => {
	test("cancels it with the reason, for the customer, and logs it with the reason", async () => {
		const { id } = await reported();
		const reason = "Valt niet onder ons onderhoud";
		await db.transaction((tx) => transitionOrder(tx, { verb: "reject", id, reason }));
		expect(await stored(id)).toMatchObject({ status: "cancelled", completedAt: null });
		expect(await decision(id)).toMatchObject({ decidedBy: "u1", rejectionReason: reason });
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({ action: "rejected", after: { status: "cancelled" }, note: reason }),
		);
	});

	test("refuses an order that's decided already", async () => {
		const { id, number } = await reported();
		await db.transaction((tx) => transitionOrder(tx, { verb: "accept", id }));
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "reject", id, reason: "Nee" })),
			),
		).toEqual([`Order ${number} isn't awaiting acceptance any more.`]);
	});
});
