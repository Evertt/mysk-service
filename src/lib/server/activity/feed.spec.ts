import { sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { getLocale, overwriteGetLocale } from "#lib/paraglide/runtime.js";
import type { Tenant } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { activity } from "#lib/server/db/schema.ts";

import { lookUpNames, present, subjectStates } from "./feed.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
// Made-up modules instead of the ones in `src/modules`.
vi.mock("#lib/modules/manifests.gen.ts", async () => ({
	manifests: (await import("#lib/modules/fakes.ts")).fakeModules,
}));

// An in-memory database with just the tables the feed reads, instead of the app's, which needs
// `DATABASE_URL`.
vi.mock("#lib/server/db/index.ts", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
});

const tenantOf = (organizationId: string, modules: string[] = []): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules,
});

const englishByDefault = getLocale;
afterEach(() => overwriteGetLocale(englishByDefault));

beforeAll(async () => {
	await db.run(
		sql`create table customer (id integer primary key, organization_id text, name text)`,
	);
	await db.run(
		sql`create table engineer (id integer primary key, organization_id text, name text)`,
	);
	await db.run(
		sql`create table equipment (id integer primary key, organization_id text, serial_number text)`,
	);
	await db.run(
		sql`create table material (id integer primary key, organization_id text, name text)`,
	);
	await db.run(sql`create table activity (
		id integer primary key autoincrement, organization_id text not null, user_id text,
		user_name text not null, action text not null, subject_type text not null,
		subject_id text not null, subject_label text not null, parent_type text, parent_id text,
		parent_label text, changes text, note text,
		created_at integer not null default (unixepoch())
	)`);
});

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenantOf("north");
	for (const table of ["customer", "engineer", "equipment", "material", "activity"]) {
		await db.run(sql.raw(`delete from ${table}`));
	}
	await db.run(sql`insert into customer (id, organization_id, name) values
		(1, 'north', 'Acme'), (2, 'south', 'Globex')`);
	await db.run(sql`insert into engineer (id, organization_id, name) values
		(3, 'north', 'Jan de Vries'), (4, 'south', 'Piet')`);
	await db.run(sql`insert into equipment (id, organization_id, serial_number) values
		(5, 'north', 'SN-5'), (6, 'south', 'SN-6')`);
	await db.run(sql`insert into material (id, organization_id, name) values
		(7, 'north', 'Filter'), (8, 'south', 'Hose')`);
});

type Entry = Partial<typeof activity.$inferInsert> &
	Pick<typeof activity.$inferInsert, "subjectType" | "subjectId" | "subjectLabel">;

/** Logs an entry (an update by Jo in the north, unless told otherwise). */
const log = async (entry: Entry) => {
	const [row] = await db
		.insert(activity)
		.values({ organizationId: "north", userName: "Jo", action: "updated", ...entry })
		.returning();
	return row;
};

describe("lookUpNames", () => {
	test("names the records by type and id", async () => {
		const names = await lookUpNames(
			new Map([
				["customer", new Set(["1"])],
				["engineer", new Set(["3"])],
				["equipment", new Set(["5"])],
				["material", new Set(["7"])],
			]),
		);
		expect(names).toEqual({
			customer: { "1": "Acme" },
			engineer: { "3": "Jan de Vries" },
			equipment: { "5": "SN-5" },
			material: { "7": "Filter" },
		});
	});

	test("leaves out other tenants' records and unknown or invalid ids", async () => {
		const names = await lookUpNames(
			new Map([
				["customer", new Set(["1", "2", "99", "abc"])],
				["engineer", new Set(["4"])],
				["material", new Set(["x"])],
			]),
		);
		expect(names).toEqual({ customer: { "1": "Acme" }, engineer: {} });
	});

	test("looks up nothing without ids", async () => {
		expect(await lookUpNames(new Map())).toEqual({});
		expect(await lookUpNames(new Map([["customer", new Set()]]))).toEqual({});
	});
});

describe("subjectStates", () => {
	test("has the latest label of each subject", async () => {
		await log({ subjectType: "equipment", subjectId: "5", subjectLabel: "SN-OLD" });
		await log({ subjectType: "equipment", subjectId: "5", subjectLabel: "SN-5" });
		await log({ subjectType: "customer", subjectId: "1", subjectLabel: "CUS-1" });
		const states = await subjectStates(
			new Map([
				["equipment", new Set(["5"])],
				["customer", new Set(["1"])],
			]),
		);
		expect(Object.fromEntries(states)).toEqual({
			"equipment:5": { label: "SN-5", deleted: false },
			"customer:1": { label: "CUS-1", deleted: false },
		});
	});

	test("knows a subject is gone once its deletion or removal is logged", async () => {
		await log({ subjectType: "customer", subjectId: "1", subjectLabel: "CUS-1" });
		await log({
			subjectType: "customer",
			subjectId: "1",
			subjectLabel: "CUS-1",
			action: "deleted",
		});
		await log({ subjectType: "member", subjectId: "m1", subjectLabel: "Kim" });
		await log({ subjectType: "member", subjectId: "m1", subjectLabel: "Kim", action: "removed" });
		await log({ subjectType: "engineer", subjectId: "3", subjectLabel: "Jan" });
		const states = await subjectStates(
			new Map([
				["customer", new Set(["1"])],
				["member", new Set(["m1"])],
				["engineer", new Set(["3"])],
			]),
		);
		expect(states.get("customer:1")?.deleted).toBe(true);
		expect(states.get("member:m1")?.deleted).toBe(true);
		expect(states.get("engineer:3")?.deleted).toBe(false);
	});

	test("only reads the tenant's log, and subjects without entries are unknown", async () => {
		await log({
			organizationId: "south",
			subjectType: "customer",
			subjectId: "1",
			subjectLabel: "S",
		});
		const states = await subjectStates(
			new Map([
				["customer", new Set(["1"])],
				["order", new Set(["9"])],
			]),
		);
		expect(states.size).toBe(0);
	});

	test("reads nothing for no subjects", async () => {
		expect(await subjectStates(new Map())).toEqual(new Map());
	});
});

describe("present", () => {
	test("shows nothing for no rows", async () => {
		expect(await present([])).toEqual([]);
	});

	test("makes entries with their subject's noun, label and page", async () => {
		const row = await log({
			subjectType: "order",
			subjectId: "10",
			subjectLabel: "ORD-1",
			note: "Called ahead",
		});
		// The order was renumbered since.
		await log({ subjectType: "order", subjectId: "10", subjectLabel: "ORD-1B" });
		const [entry] = await present([row]);
		expect(entry).toEqual({
			id: row.id,
			at: row.createdAt,
			user: "Jo",
			action: "updated",
			subject: {
				type: "order",
				noun: "order",
				label: "ORD-1",
				target: { id: "10", label: "ORD-1B" },
			},
			parent: null,
			changes: [],
			note: "Called ahead",
		});
	});

	test("has no page for a subject that was deleted, or a type without pages", async () => {
		const rows = [
			await log({ subjectType: "customer", subjectId: "1", subjectLabel: "CUS-1" }),
			await log({
				subjectType: "customer",
				subjectId: "1",
				subjectLabel: "CUS-1",
				action: "deleted",
			}),
			await log({ subjectType: "order_line", subjectId: "7", subjectLabel: "Filter" }),
		];
		const entries = await present(rows);
		expect(entries.map((entry) => entry.subject.target)).toEqual([null, null, null]);
		expect(entries[2].subject.noun).toBe("order line");
	});

	test("links a part to its parent", async () => {
		const row = await log({
			subjectType: "order_line",
			subjectId: "7",
			subjectLabel: "Filter",
			parentType: "order",
			parentId: "10",
			parentLabel: "ORD-1",
		});
		const [entry] = await present([row]);
		expect(entry.parent).toEqual({
			type: "order",
			noun: "order",
			label: "ORD-1",
			target: { id: "10", label: "ORD-1" },
		});
	});

	test("shows the names that changed fields refer to, in the tenant", async () => {
		const row = await log({
			subjectType: "order",
			subjectId: "10",
			subjectLabel: "ORD-1",
			changes: { engineerId: [4, 3], customerId: [null, 1], status: ["scheduled", "in_progress"] },
		});
		const [entry] = await present([row]);
		expect(entry.changes).toEqual([
			// Piet is the south's engineer.
			{ field: "engineer", before: "#4", after: "Jan de Vries" },
			{ field: "customer", before: "—", after: "Acme" },
			{ field: "status", before: "Scheduled", after: "In progress" },
		]);
	});

	test("reads in the language of the request", async () => {
		overwriteGetLocale(() => "nl");
		const row = await log({
			subjectType: "order",
			subjectId: "10",
			subjectLabel: "ORD-1",
			changes: { status: ["scheduled", "in_progress"] },
		});
		const [entry] = await present([row]);
		expect(entry.subject.noun).toBe("opdracht");
		expect(entry.changes).toEqual([
			{ field: "status", before: "Ingepland", after: "In uitvoering" },
		]);
	});

	test("shows a module's records, with a page only for tenants with the module", async () => {
		const row = await log({ subjectType: "widget", subjectId: "2", subjectLabel: "W-2" });
		const [without] = await present([row]);
		expect(without.subject).toMatchObject({ noun: "widget", label: "W-2", target: null });

		locals.tenant = tenantOf("north", ["widgets"]);
		const [withModule] = await present([row]);
		expect(withModule.subject.target).toEqual({ id: "2", label: "W-2" });
	});

	test("shows a module by its name", async () => {
		const row = await log({
			subjectType: "module",
			subjectId: "widgets",
			subjectLabel: "widgets",
			action: "module_enabled",
		});
		const [entry] = await present([row]);
		expect(entry.subject.label).toBe("Widgets");
		expect(entry.subject.target).not.toBeNull();
	});
});
