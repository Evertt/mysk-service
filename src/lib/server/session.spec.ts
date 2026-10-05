import { isHttpError } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.js";
import { customer } from "#lib/server/db/schema.js";

import {
	inTenant,
	loadTenant,
	requireMember,
	requireModule,
	requireRole,
	requireUser,
	type Tenant,
} from "./session.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// An in-memory database instead of the app's, which needs `DATABASE_URL`.
vi.mock("#lib/server/db/index.js", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	return { db: drizzle(createClient({ url: ":memory:" })) };
});

const user = { id: "u1", name: "Jo" };
const tenant: Tenant = {
	organizationId: "north",
	name: "North",
	slug: "north",
	roles: ["member"],
	modules: [],
};

/** The status of the HTTP error `fn` throws. */
function statusOf(fn: () => unknown) {
	try {
		fn();
	} catch (error) {
		if (isHttpError(error)) return error.status;
		throw error;
	}
	throw new Error("Expected an HTTP error");
}

beforeEach(() => {
	delete locals.user;
	delete locals.tenant;
});

describe("requireUser", () => {
	test("returns the signed-in user", () => {
		locals.user = user;
		expect(requireUser()).toBe(user);
	});

	test("refuses a visitor who isn't signed in with a 401", () => {
		expect(statusOf(requireUser)).toBe(401);
	});
});

describe("requireMember", () => {
	test("returns the user with their tenant", () => {
		Object.assign(locals, { user, tenant });
		expect(requireMember()).toEqual({ user, ...tenant });
	});

	test("refuses a user without an organization with a 403", () => {
		locals.user = user;
		expect(statusOf(requireMember)).toBe(403);
	});

	test("asks a visitor to sign in first", () => {
		locals.tenant = tenant;
		expect(statusOf(requireMember)).toBe(401);
	});
});

describe("requireModule", () => {
	test("returns the tenant when it has the module", () => {
		Object.assign(locals, { user, tenant: { ...tenant, modules: ["contracts"] } });
		expect(requireModule("contracts")).toMatchObject({ organizationId: "north" });
	});

	test("pretends the module doesn't exist for a tenant without it", () => {
		Object.assign(locals, { user, tenant });
		expect(statusOf(() => requireModule("contracts"))).toBe(404);
	});

	test("checks membership before the module", () => {
		locals.user = user;
		expect(statusOf(() => requireModule("contracts"))).toBe(403);
	});
});

describe("requireRole", () => {
	test("returns the tenant when the user has one of the roles", () => {
		Object.assign(locals, { user, tenant: { ...tenant, roles: ["member", "admin"] } });
		expect(requireRole("owner", "admin")).toMatchObject({ organizationId: "north" });
	});

	test("refuses a user without any of the roles with a 403", () => {
		Object.assign(locals, { user, tenant });
		expect(statusOf(() => requireRole("owner", "admin"))).toBe(403);
	});
});

describe("inTenant", () => {
	test("compares the table's organization with the current tenant's", () => {
		Object.assign(locals, { user, tenant });
		expect(new SQLiteSyncDialect().sqlToQuery(inTenant(customer))).toMatchObject({
			sql: '"customer"."organization_id" = ?',
			params: ["north"],
		});
	});

	test("refuses to build a query outside a tenant", () => {
		locals.user = user;
		expect(statusOf(() => inTenant(customer))).toBe(403);
	});
});

describe("loadTenant", () => {
	beforeAll(async () => {
		await db.run(sql`create table organization (id text primary key, name text, slug text)`);
		await db.run(
			sql`create table member (id text primary key, organization_id text, user_id text, role text, created_at integer)`,
		);
		await db.run(sql`create table organization_module (organization_id text, module_id text)`);
		await db.run(sql`insert into organization (id, name, slug) values
			('north', 'North Facilities', 'north'),
			('south', 'South Services', 'south'),
			('east', 'East Engineering', 'east')`);
		await db.run(sql`insert into member (id, organization_id, user_id, role, created_at) values
			('m1', 'south', 'jo', 'member', 2000),
			('m2', 'north', 'jo', 'admin, member', 1000),
			('m3', 'east', 'sam', 'owner', 1000)`);
		await db.run(sql`insert into organization_module (organization_id, module_id) values
			('south', 'contracts'),
			('east', 'contracts')`);
	});

	test("uses the active organization", async () => {
		expect(await loadTenant("jo", "south")).toEqual({
			organizationId: "south",
			name: "South Services",
			slug: "south",
			roles: ["member"],
			modules: ["contracts"],
		});
	});

	test("falls back to the first organization joined", async () => {
		expect(await loadTenant("jo", null)).toMatchObject({ organizationId: "north" });
		expect(await loadTenant("jo", undefined)).toMatchObject({ organizationId: "north" });
	});

	test("ignores an active organization the user isn't a member of", async () => {
		expect(await loadTenant("jo", "east")).toMatchObject({ organizationId: "north" });
	});

	test("splits several roles and only lists the tenant's own modules", async () => {
		expect(await loadTenant("jo", "north")).toMatchObject({
			roles: ["admin", "member"],
			modules: [],
		});
	});

	test("is undefined for a user without memberships", async () => {
		expect(await loadTenant("nobody", "north")).toBeUndefined();
	});
});
