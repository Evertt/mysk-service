import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	type ActivityRecord,
	diff,
	ignoredFields,
	recordActivity,
} from "#lib/server/activity/log.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the tables the log touches, instead of the app's. Not an
// in-memory one: libsql gives a transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "activity-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
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

describe("diff", () => {
	test("lists the fields of `after` that changed, with both values", () => {
		expect(
			diff(
				{ status: "quote", priority: "high", engineerId: null },
				{ status: "scheduled", priority: "high", engineerId: 3 },
			),
		).toEqual({ status: ["quote", "scheduled"], engineerId: [null, 3] });
	});

	test("only compares the fields `after` sets", () => {
		expect(diff({ city: "Utrecht", lines: [1, 2], number: "X" }, { city: "Utrecht" })).toEqual({});
		expect(diff({ city: "Utrecht" }, { city: "Delft", segment: undefined })).toEqual({
			city: ["Utrecht", "Delft"],
		});
	});

	test("compares dates by time and gives them as ISO strings", () => {
		const day = new Date("2026-10-07T09:00:00Z");
		expect(diff({ scheduledFor: day }, { scheduledFor: new Date(day.getTime()) })).toEqual({});
		expect(diff({ scheduledFor: null }, { scheduledFor: day })).toEqual({
			scheduledFor: [null, "2026-10-07T09:00:00.000Z"],
		});
	});

	test("treats null, undefined and the empty string as nothing", () => {
		expect(diff({ notes: null }, { notes: "" })).toEqual({});
		expect(diff({}, { notes: null })).toEqual({});
		expect(diff({ notes: "Call first" }, { notes: "" })).toEqual({ notes: ["Call first", null] });
	});

	test("compares arrays and objects by value", () => {
		expect(diff({ equipmentIds: [1, 2] }, { equipmentIds: [1, 2] })).toEqual({});
		expect(diff({ equipmentIds: [1, 2] }, { equipmentIds: [1, 3] })).toEqual({
			equipmentIds: [
				[1, 2],
				[1, 3],
			],
		});
	});

	test("compares numbers exactly, and booleans", () => {
		expect(diff({ stock: 2 }, { stock: 2.0 })).toEqual({});
		expect(diff({ active: true }, { active: false })).toEqual({ active: [true, false] });
	});

	test("skips ignored fields", () => {
		const before = { id: 1, createdAt: new Date(0), name: "A" };
		const after = { id: 2, createdAt: new Date(), name: "B" };
		expect(diff(before, after, { ignore: ignoredFields })).toEqual({ name: ["A", "B"] });
	});
});

const tenant = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules: [],
});

/** Runs `work` in a transaction, like the app does. */
const inTransaction = <T>(work: (tx: Transaction) => Promise<T>) =>
	db.transaction((tx) => work(tx as unknown as Transaction));

const record = (entry: ActivityRecord) => inTransaction((tx) => recordActivity(tx, entry));

/** The log as stored, oldest first. */
async function log() {
	const { rows } = await db.$client.execute(
		"select organization_id, user_id, user_name, action, subject_type, subject_id, subject_label, parent_type, parent_id, parent_label, changes, note from activity order by id",
	);
	return (rows as unknown as Record<string, unknown>[]).map((row): Record<string, unknown> => ({
		...row,
		changes: typeof row.changes === "string" ? JSON.parse(row.changes) : row.changes,
	}));
}

beforeEach(async () => {
	Object.assign(locals, { user: { id: "u1", name: "Avery Admin" }, tenant: tenant("north") });
	await db.$client.executeMultiple(`
		delete from activity;
	`);
});

describe("recordActivity", () => {
	test("logs who did what to which record in the current tenant", async () => {
		expect(
			await record({
				action: "created",
				subject: { type: "customer", id: 7, label: "CUST-0007" },
				note: "",
			}),
		).toBe(true);
		expect(await log()).toEqual([
			{
				organization_id: "north",
				user_id: "u1",
				user_name: "Avery Admin",
				action: "created",
				subject_type: "customer",
				subject_id: "7",
				subject_label: "CUST-0007",
				parent_type: null,
				parent_id: null,
				parent_label: null,
				changes: null,
				note: null,
			},
		]);
	});

	test("logs an update's changed fields, and nothing if none changed", async () => {
		const subject = { type: "order", id: 12, label: "ORD-2026-00012" };
		const before = { id: 12, status: "scheduled", engineerId: null, createdAt: new Date(0) };
		const after = { status: "in_progress", engineerId: 3, createdAt: new Date() };
		expect(await record({ action: "updated", subject, before, after })).toBe(true);
		expect(
			await record({ action: "updated", subject, before, after: { status: "scheduled" } }),
		).toBe(false);
		expect(
			await record({
				action: "updated",
				subject,
				before,
				after: { engineerId: 3 },
				ignore: ["engineerId"],
			}),
		).toBe(false);
		const [entry, ...rest] = await log();
		expect(rest).toEqual([]);
		expect(entry.changes).toEqual({ status: ["scheduled", "in_progress"], engineerId: [null, 3] });
	});

	test("logs nothing when the transaction is rolled back", async () => {
		await expect(
			inTransaction(async (tx) => {
				await recordActivity(tx, {
					action: "deleted",
					subject: { type: "customer", id: 1, label: "CUST-0001" },
				});
				throw new Error("Refused");
			}),
		).rejects.toThrow("Refused");
		expect(await log()).toEqual([]);
	});

	test("logs a field engineer's changes from the engineer portal", async () => {
		Object.assign(locals, {
			user: { id: "u3", name: "Eli Engineer" },
			tenant: { ...tenant("north"), roles: ["engineer"] },
		});
		const subject = { type: "order", id: 4, label: "ORD-2026-00004" };
		expect(await record({ action: "work_started", subject })).toBe(true);
		expect(await log()).toMatchObject([
			{ organization_id: "north", user_id: "u3", user_name: "Eli Engineer" },
		]);
	});

	test("logs as `by` when given, e.g. in another organization than the current one", async () => {
		const subject = { type: "invitation", id: "inv1", label: "new@example.com" };
		const by = { organizationId: "south", user: { id: "u9", name: "New Member" } };
		await inTransaction((tx) => recordActivity(tx, { action: "accepted", subject }, by));
		expect(await log()).toMatchObject([
			{ organization_id: "south", user_id: "u9", user_name: "New Member", action: "accepted" },
		]);
	});

	test("needs a signed-in member", async () => {
		delete locals.tenant;
		await expect(
			record({ action: "created", subject: { type: "customer", id: 1, label: "X" } }),
		).rejects.toMatchObject({ status: 403 });
		expect(await log()).toEqual([]);
	});
});
