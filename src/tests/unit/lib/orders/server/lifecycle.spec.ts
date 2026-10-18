/**
 * Moving an order from one status to another (`transitionOrder()`), by each verb of the
 * transition table: what it stores, the completion date, whether the modules are asked, the one
 * activity entry, its refusals and the tenant's scope. On a small database of the tables it
 * touches, with a made-up module that records what it's asked to save (and refuses when told to),
 * and the activity log recorded rather than run.
 */
import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { overwriteGetTimeZone } from "#lib/dates.ts";
import { type OrderStatus, orderStatuses } from "#lib/models.ts";
import type { ModuleId } from "#lib/modules/ids.ts";
import { type OrderProblem, saving } from "#lib/orders/extensions.ts";
import { beginOrderChange, transitionOrder } from "#lib/orders/server/lifecycle.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { order, orderRequest, orderSignoff } from "#lib/server/db/schema.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();
/** What the made-up module saves of each change, and the problems it answers (none: it saves). */
const parts = vi.fn(async (_change: unknown): Promise<OrderProblem[] | undefined> => undefined);
// The made-up module instead of the ones in `src/modules` (see `hooks.spec.ts`).
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
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
			email text not null default '', phone text not null default '',
			specialty text not null default 'mechanical', region text not null default '',
			hourly_rate integer not null default 0, active integer not null default 1,
			hired_at text not null default '2020-01-01', user_id text
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
		create table order_signoff (
			order_id integer primary key, organization_id text not null, signer_name text not null,
			signature text not null, engineer_name text, engineer_signature text, user_id text,
			signed_at integer not null
		);
		insert into engineer (id, organization_id, name, active, user_id) values
			(1, 'north', 'Eli', 1, 'e1'), (2, 'south', 'Sam', 1, null), (3, 'north', 'Ina', 0, null),
			(4, 'north', 'Noa', 1, 'e4');
	`);
	return { db: drizzle(client, { schema }) };
});

registry.modules = [
	defineServerModule("spy" as ModuleId, [contribute(saving, (change) => parts(change))]),
];

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string, roles = ["member"]): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles,
	modules: ["spy"],
});

overwriteGetTimeZone(() => "Europe/Amsterdam");

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	parts.mockClear();
	parts.mockImplementation(async () => undefined);
	await db.delete(orderSignoff);
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
		engineerId = null as number | null,
	}: {
		organizationId?: string;
		completedAt?: Temporal.Instant | null;
		engineerId?: number | null;
	} = {},
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
			engineerId,
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
		parts.mockImplementation(async () => [{ message: "Not enough Scharnier in stock." }]);
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

/** Makes the requests the engineer's: Eli de Vries's account, linked to engineer 1 (Eli). */
function asEngineer(userId = "e1", name = "Eli de Vries") {
	locals.user = { id: userId, name };
	locals.tenant = tenant("north", ["engineer"]);
}

describe("start: the engineer starts a scheduled job", () => {
	test("it's then in progress, with the modules following; logged as work started", async () => {
		const { id, number } = await orderIn("scheduled", { engineerId: 1 });
		asEngineer();
		expect(await db.transaction((tx) => transitionOrder(tx, { verb: "start", id }))).toEqual({
			id,
			number,
		});
		expect(await stored(id)).toMatchObject({ status: "in_progress", completedAt: null });
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({ action: "work_started", after: { status: "in_progress" } }),
		);
	});

	test("another engineer's order is a 404, and stays as it was", async () => {
		const { id } = await orderIn("scheduled", { engineerId: 4 });
		asEngineer();
		expect(
			await refusal(() => db.transaction((tx) => transitionOrder(tx, { verb: "start", id }))),
		).toBe(404);
		expect((await stored(id)).status).toBe("scheduled");
	});

	test("a job under way can't be started again", async () => {
		const { id } = await orderIn("in_progress", { engineerId: 1 });
		asEngineer();
		expect(
			await refusal(() => db.transaction((tx) => transitionOrder(tx, { verb: "start", id }))),
		).toEqual(["This order is in progress; it can't be changed here"]);
	});
});

const signoff = {
	signerName: "Mo Visser",
	signature: "data:image/png;base64,mo",
	engineerSignature: "data:image/png;base64,eli",
};

const storedSignoff = async (orderId: number) =>
	(await db.select().from(orderSignoff).where(eq(orderSignoff.orderId, orderId)))[0];

describe("complete: the engineer completes the job under way, with the sign-off", () => {
	test("it's completed when it's signed, the sign-off stored, logged as completed with the signer", async () => {
		const { id } = await orderIn("in_progress", { engineerId: 1 });
		asEngineer();
		await db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff }));
		const after = await stored(id);
		expect(after.status).toBe("completed");
		expect(await storedSignoff(id)).toMatchObject({
			organizationId: "north",
			signerName: "Mo Visser",
			engineerName: "Eli",
			engineerSignature: "data:image/png;base64,eli",
			userId: "e1",
			signedAt: after.completedAt,
		});
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "completed",
				after: expect.objectContaining({ status: "completed", signedBy: "Mo Visser" }),
			}),
		);
	});

	test("a job that isn't started yet is started first", async () => {
		const { id } = await orderIn("scheduled", { engineerId: 1 });
		asEngineer();
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff })),
			),
		).toEqual(["Start the job first"]);
		expect(await storedSignoff(id)).toBeUndefined();
	});

	test("is completed at the moment it's signed, whatever date it had", async () => {
		const stale = Temporal.Instant.from("2026-09-01T08:00:00Z");
		const { id } = await orderIn("in_progress", { engineerId: 1, completedAt: stale });
		asEngineer();
		await db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff }));
		const after = await stored(id);
		expect(after.completedAt).not.toEqual(stale);
		expect(after.completedAt).toEqual((await storedSignoff(id)).signedAt);
	});
});

describe("invoice and uninvoice: invoicing moves an invoice's orders", () => {
	const loaded = async (id: number) => {
		const [found] = await db
			.select({ id: order.id, number: order.number, status: order.status })
			.from(order)
			.where(eq(order.id, id));
		return found;
	};

	test("issuing makes its completed orders invoiced, each logged with the note", async () => {
		const done = Temporal.Instant.from("2026-10-01T10:00:00Z");
		const first = await orderIn("completed", { completedAt: done });
		const second = await orderIn("completed", { completedAt: done });
		const orders = [await loaded(first.id), await loaded(second.id)];
		await db.transaction((tx) =>
			transitionOrder(tx, { verb: "invoice", orders, note: "Invoiced by F-2026-0001" }),
		);
		expect(await stored(first.id)).toMatchObject({ status: "invoiced", completedAt: done });
		expect(await stored(second.id)).toMatchObject({ status: "invoiced", completedAt: done });
		expect(logged.mock.calls.map(([record]) => record)).toEqual([
			expect.objectContaining({
				action: "updated",
				subject: { type: "order", id: first.id, label: first.number },
				after: expect.objectContaining({ status: "invoiced" }),
				note: "Invoiced by F-2026-0001",
			}),
			expect.objectContaining({ subject: { type: "order", id: second.id, label: second.number } }),
		]);
		// The modules follow each order, as they do every move.
		expect(parts.mock.calls.map(([change]) => change)).toEqual([
			expect.objectContaining({
				order: expect.objectContaining({ id: first.id }),
				status: "invoiced",
			}),
			expect.objectContaining({
				order: expect.objectContaining({ id: second.id }),
				status: "invoiced",
			}),
		]);
	});

	test("voiding makes its orders that are still invoiced completed again, and leaves the rest", async () => {
		const invoiced = await orderIn("invoiced", {
			completedAt: Temporal.Instant.from("2026-10-01T10:00:00Z"),
		});
		const reopened = await orderIn("scheduled");
		const orders = [await loaded(invoiced.id), await loaded(reopened.id)];
		await db.transaction((tx) =>
			transitionOrder(tx, { verb: "uninvoice", orders, note: "Voided F-2026-0001" }),
		);
		expect((await stored(invoiced.id)).status).toBe("completed");
		expect((await stored(reopened.id)).status).toBe("scheduled");
		expect(logged.mock.calls.map(([record]) => record.subject.id)).toEqual([invoiced.id]);
	});

	test("an order invoiced without a completion date gets one", async () => {
		const { id } = await orderIn("completed");
		const orders = [await loaded(id)];
		await db.transaction((tx) => transitionOrder(tx, { verb: "invoice", orders, note: "F-1" }));
		expect((await stored(id)).completedAt).not.toBeNull();
	});

	test("a module's refusal stops the invoice, saying which order, and moves none of them", async () => {
		const first = await orderIn("completed");
		const second = await orderIn("completed");
		parts.mockImplementation(async (change) => {
			const { order: moving } = change as { order: { id: number } };
			return moving.id === second.id ? [{ message: "A checklist is open." }] : undefined;
		});
		const orders = [await loaded(first.id), await loaded(second.id)];
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "invoice", orders, note: "F-1" })),
			),
		).toEqual([`${second.number}: A checklist is open.`]);
		expect((await stored(first.id)).status).toBe("completed");
		expect((await stored(second.id)).status).toBe("completed");
	});

	test("doesn't move another tenant's order, also when its id is passed", async () => {
		const { id } = await orderIn("completed", { organizationId: "south" });
		const orders = [await loaded(id)];
		await db.transaction((tx) => transitionOrder(tx, { verb: "invoice", orders, note: "F-1" }));
		expect((await stored(id)).status).toBe("completed");
	});
});

describe("the order form's change (beginOrderChange)", () => {
	test("an edited order: its status columns, the modules asked with the form's parts, one entry", async () => {
		const { id, number } = await orderIn("in_progress");
		const form = { materials: { lines: [] } };
		await db.transaction(async (tx) => {
			const change = await beginOrderChange(tx, id, "completed");
			expect(change.before).toMatchObject({ id, status: "in_progress" });
			expect(change.columns.status).toBe("completed");
			expect(change.columns.completedAt).not.toBeNull();
			await tx
				.update(order)
				.set({ ...change.columns, description: "Scharnier vervangen" })
				.where(eq(order.id, id));
			await change.finish(
				{ id, number },
				{
					form,
					before: { equipmentIds: [10] },
					after: { ...change.columns, description: "Scharnier vervangen", equipmentIds: [10, 11] },
				},
			);
		});
		expect(parts).toHaveBeenCalledWith(
			expect.objectContaining({ order: { id, number }, status: "completed", form }),
		);
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "updated",
				subject: { type: "order", id, label: number },
				before: expect.objectContaining({ status: "in_progress", equipmentIds: [10] }),
				after: expect.objectContaining({
					description: "Scharnier vervangen",
					equipmentIds: [10, 11],
				}),
				ignore: ["completedAt"],
			}),
		);
	});

	test("a new order: nothing to guard, the modules asked, no entry (its creation logs it)", async () => {
		// The order the form creates (through `createOrders()`, in the same transaction).
		const created = await orderIn("quote");
		await db.transaction(async (tx) => {
			const change = await beginOrderChange(tx, null, "quote");
			expect(change.before).toBeUndefined();
			expect(change.columns).toEqual({ status: "quote", completedAt: null });
			await change.finish(created, { form: {}, after: {} });
		});
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "quote", form: {} }));
		expect(logged).not.toHaveBeenCalled();
	});

	test("an order saved with the status it has still saves the modules' parts", async () => {
		const { id, number } = await orderIn("scheduled");
		await db.transaction(async (tx) => {
			const change = await beginOrderChange(tx, id, "scheduled");
			await change.finish({ id, number }, { form: {}, after: change.columns });
		});
		expect(parts).toHaveBeenCalledWith(expect.objectContaining({ status: "scheduled" }));
	});

	test("refuses an invoiced order, one awaiting acceptance, and another tenant's", async () => {
		const begin = (id: number) =>
			refusal(() => db.transaction((tx) => beginOrderChange(tx, id, "completed")));
		const invoiced = await orderIn("invoiced");
		expect(await begin(invoiced.id)).toEqual([
			`${invoiced.number} is invoiced: it's on an invoice that has been sent, so it can't be changed`,
		]);
		const awaiting = await orderIn("awaiting_acceptance");
		expect(await begin(awaiting.id)).toEqual([`Accept or reject order ${awaiting.number} first.`]);
		const southern = await orderIn("quote", { organizationId: "south" });
		expect(await begin(southern.id)).toBe(404);
	});

	test("a module's refusal refuses the form with its problems, each on its field", async () => {
		parts.mockImplementation(async () => [
			{
				message: "Not enough Scharnier in stock.",
				path: ["modules", "materials", "lines", 0, "quantity"],
			},
		]);
		const { id, number } = await orderIn("quote");
		let issues: unknown;
		try {
			await db.transaction(async (tx) => {
				const change = await beginOrderChange(tx, id, "scheduled");
				await change.finish({ id, number }, { form: {}, after: change.columns });
			});
		} catch (error) {
			issues = isValidationError(error) ? error.issues : error;
		}
		expect(issues).toMatchObject([
			{
				message: "Not enough Scharnier in stock.",
				path: ["modules", "materials", "lines", 0, "quantity"],
			},
		]);
	});

	test("a done order kept done keeps its completion date", async () => {
		const done = Temporal.Instant.from("2026-10-01T10:00:00Z");
		const { id } = await orderIn("completed", { completedAt: done });
		await db.transaction(async (tx) => {
			expect((await beginOrderChange(tx, id, "completed")).columns.completedAt).toEqual(done);
		});
	});
});

describe("each verb moves an order only from its statuses, and refuses it from the others", () => {
	// The statuses each verb moves from, as the plan's rules (Q1) have them.
	const movesFrom: Record<string, readonly OrderStatus[]> = {
		set: ["quote", "scheduled", "in_progress", "completed", "cancelled"],
		plan: ["quote", "scheduled", "in_progress"],
		accept: ["awaiting_acceptance"],
		reject: ["awaiting_acceptance"],
		start: ["scheduled"],
		complete: ["in_progress"],
	};
	// What each verb moves an order with `status` to: the office's set to another status than its
	// own; the planner, without an engineer, keeps it.
	const movesTo = (verb: string, status: OrderStatus): OrderStatus => {
		const to: Record<string, OrderStatus> = {
			set: status === "cancelled" ? "quote" : "cancelled",
			plan: status,
			accept: "quote",
			reject: "cancelled",
			start: "in_progress",
			complete: "completed",
		};
		return to[verb];
	};
	// The statuses as an engineer's refusal names them, in English.
	const statusNames: Record<OrderStatus, string> = {
		awaiting_acceptance: "awaiting acceptance",
		quote: "quote",
		scheduled: "scheduled",
		in_progress: "in progress",
		completed: "completed",
		invoiced: "invoiced",
		cancelled: "cancelled",
	};
	// Why each verb refuses an order with `status`, in English.
	const refusedWith = (verb: string, number: string, status: OrderStatus) => {
		if (verb === "set") {
			return status === "invoiced"
				? `${number} is invoiced: it's on an invoice that has been sent, so it can't be changed`
				: `Accept or reject order ${number} first.`;
		}
		if (verb === "plan") return "Only open orders can be scheduled";
		if (verb === "accept" || verb === "reject") {
			return `Order ${number} isn't awaiting acceptance any more.`;
		}
		return status === "scheduled"
			? "Start the job first"
			: `This order is ${statusNames[status]}; it can't be changed here`;
	};
	const move = (verb: string, id: number, status: OrderStatus) => {
		const day = Temporal.PlainDate.from("2026-11-03");
		const transitions = {
			set: { verb: "set", id, to: movesTo("set", status) as "quote" | "cancelled" },
			plan: { verb: "plan", id, engineerId: null, day, time: "09:00" },
			accept: { verb: "accept", id },
			reject: { verb: "reject", id, reason: "Nee" },
			start: { verb: "start", id },
			complete: { verb: "complete", id, signoff },
		} as const;
		return db.transaction((tx) =>
			transitionOrder(tx, transitions[verb as keyof typeof transitions]),
		);
	};

	for (const [verb, from] of Object.entries(movesFrom)) {
		for (const status of orderStatuses) {
			const moves = from.includes(status);
			test(`${verb} ${moves ? "moves" : "refuses"} an order that's ${status}`, async () => {
				const engineers = verb === "start" || verb === "complete";
				const { id, number } = await orderIn(status, { engineerId: engineers ? 1 : null });
				if (engineers) asEngineer();
				const refused = await refusal(() => move(verb, id, status));
				if (moves) {
					expect(refused).toEqual([]);
					expect((await stored(id)).status).toBe(movesTo(verb, status));
					// The planner's move keeps the status, but not the time: 3 November, 09:00 in Amsterdam.
					if (verb === "plan") {
						expect((await stored(id)).scheduledFor).toEqual(
							Temporal.Instant.from("2026-11-03T08:00:00Z"),
						);
					}
				} else {
					expect(refused).toEqual([refusedWith(verb, number, status)]);
					expect((await stored(id)).status).toBe(status);
				}
			});
		}
	}

	// Invoicing refuses no order for its status: it moves those of an invoice's orders it moves, and
	// leaves the rest (a module can still refuse one, see above).
	const invoicing = { invoice: ["completed", "invoiced"], uninvoice: ["invoiced", "completed"] };
	for (const [verb, [from, to]] of Object.entries(invoicing) as [
		"invoice" | "uninvoice",
		OrderStatus[],
	][]) {
		for (const status of orderStatuses) {
			const moves = status === from;
			test(`${verb} ${moves ? "moves" : "leaves"} an order that's ${status}`, async () => {
				const { id, number } = await orderIn(status);
				const orders = [{ id, number, status }];
				await db.transaction((tx) => transitionOrder(tx, { verb, orders, note: "F-1" }));
				expect((await stored(id)).status).toBe(moves ? to : status);
				expect(logged).toHaveBeenCalledTimes(moves ? 1 : 0);
			});
		}
	}

	test("the engineer can't complete a job that's done already", async () => {
		const { id } = await orderIn("completed", { engineerId: 1 });
		asEngineer();
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff })),
			),
		).toEqual(["This order is completed; it can't be changed here"]);
	});
});

describe("another tenant's (or engineer's) order is a 404 for every verb", () => {
	test("plan", async () => {
		const { id } = await orderIn("quote", { organizationId: "south" });
		expect(
			await refusal(() =>
				db.transaction((tx) =>
					transitionOrder(tx, {
						verb: "plan",
						id,
						engineerId: null,
						day: Temporal.PlainDate.from("2026-11-03"),
						time: "09:00",
					}),
				),
			),
		).toBe(404);
	});

	test("reject", async () => {
		const { id } = await orderIn("awaiting_acceptance", { organizationId: "south" });
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "reject", id, reason: "Nee" })),
			),
		).toBe(404);
		expect((await stored(id)).status).toBe("awaiting_acceptance");
	});

	test("complete", async () => {
		const { id } = await orderIn("in_progress", { engineerId: 4 });
		asEngineer();
		expect(
			await refusal(() =>
				db.transaction((tx) => transitionOrder(tx, { verb: "complete", id, signoff })),
			),
		).toBe(404);
		expect((await stored(id)).status).toBe("in_progress");
		expect(await storedSignoff(id)).toBeUndefined();
	});
});

describe("the modules learn the status an order moves from", () => {
	test("a move, an invoice's orders, an edited order and a new one", async () => {
		const moved = await orderIn("scheduled");
		await db.transaction((tx) =>
			transitionOrder(tx, { verb: "set", id: moved.id, to: "in_progress" }),
		);
		const invoiced = await orderIn("completed");
		const [invoicedRow] = await db
			.select({ id: order.id, number: order.number, status: order.status })
			.from(order)
			.where(eq(order.id, invoiced.id));
		await db.transaction((tx) =>
			transitionOrder(tx, { verb: "invoice", orders: [invoicedRow], note: "F-1" }),
		);
		const edited = await orderIn("quote");
		const created = await orderIn("quote");
		await db.transaction(async (tx) => {
			const change = await beginOrderChange(tx, edited.id, "scheduled");
			await change.finish(edited, { form: {}, after: change.columns });
		});
		await db.transaction(async (tx) => {
			const change = await beginOrderChange(tx, null, "quote");
			await change.finish(created, { form: {}, after: {} });
		});
		expect(
			parts.mock.calls.map(([change]) => {
				const { from, status } = change as { from: OrderStatus | null; status: OrderStatus };
				return { from, status };
			}),
		).toEqual([
			{ from: "scheduled", status: "in_progress" },
			{ from: "completed", status: "invoiced" },
			{ from: "quote", status: "scheduled" },
			{ from: null, status: "quote" },
		]);
	});
});
