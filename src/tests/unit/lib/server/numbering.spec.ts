import { rmSync } from "node:fs";

import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { formatCode, type NumberKind } from "#lib/numbering.ts";
import type { Tenant } from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { nextNumber, type NumberTarget } from "#lib/server/numbering.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// A temporary database with just the columns the numbers are in, instead of the app's. Not an
// in-memory one: libsql gives a transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "numbering-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table customer (id integer primary key, organization_id text, code text);
		create table "order" (id integer primary key, organization_id text, number text);
		create table widget (id integer primary key, organization_id text, number text);
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const user = { id: "u1", name: "Jo" };
const tenantOf = (organizationId: string): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules: [],
});

// A module's own kind of number: its format, and the table it is kept in.
const widget = sqliteTable("widget", {
	id: integer("id").primaryKey(),
	organizationId: text("organization_id").notNull(),
	number: text("number").notNull(),
});
const widgets: NumberTarget = {
	format: { prefix: "WID-", digits: 4, yearly: true },
	table: widget,
	column: widget.number,
};

const next = (kind: NumberKind | NumberTarget) => db.transaction((tx) => nextNumber(tx, kind));

beforeEach(() => {
	Object.assign(locals, { user, tenant: tenantOf("north") });
});

describe("nextNumber", () => {
	test("starts at 1 for a tenant without any", async () => {
		expect(await next("customer")).toBe("CUST-0001");
		expect(await next("order")).toBe(formatCode("order", 1));
	});

	test("is one more than the highest sequence, across years", async () => {
		await db.run(sql`insert into "order" (organization_id, number) values
			('north', 'ORD-2025-00041'), ('north', 'ORD-2026-00007'), ('north', 'ORD-2025-00009')`);
		expect(await next("order")).toBe(formatCode("order", 42));
	});

	test("counts numerically, not alphabetically", async () => {
		await db.run(sql`insert into "order" (organization_id, number) values
			('north', 'ORD-2026-00009'), ('north', 'ORD-2026-00010'), ('north', 'ORD-2026-100000')`);
		expect(await next("order")).toBe(formatCode("order", 100001));
	});

	test("reads the sequence after each kind's own prefix", async () => {
		await db.run(sql`insert into customer (organization_id, code) values ('north', 'CUST-0012')`);
		await db.run(sql`insert into widget (organization_id, number)
			values ('north', 'WID-2026-0020')`);
		expect(await next("customer")).toBe("CUST-0013");
		expect(await next(widgets)).toBe(formatCode(widgets.format, 21));
	});

	test("only counts the current tenant's records", async () => {
		await db.run(sql`insert into customer (organization_id, code) values ('south', 'CUST-0500')`);
		expect(await next("customer")).toBe("CUST-0013");
		Object.assign(locals, { tenant: tenantOf("south") });
		expect(await next("customer")).toBe("CUST-0501");
		Object.assign(locals, { tenant: tenantOf("east") });
		expect(await next("customer")).toBe("CUST-0001");
	});
});
