import { isHttpError } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { db } from "#lib/server/db/index.js";
import { customer, engineer, order } from "#lib/server/db/schema.js";

import {
	idInTenant,
	idsInTenant,
	inTenant,
	loadTenant,
	requireEngineer,
	requireManager,
	requireMember,
	requireModule,
	requireRole,
	requireTenant,
	requireUser,
	type Tenant,
	tenantJoin,
} from "./session.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));

// An in-memory database instead of the app's, which needs `DATABASE_URL`.
vi.mock("#lib/server/db/index.js", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.js");
	return { db: drizzle(createClient({ url: ":memory:" }), { schema }) };
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

describe("field engineers", () => {
	const fieldEngineer = { ...tenant, roles: ["engineer"] };

	/** The status of the HTTP error a promise rejects with. */
	const rejection = async (promise: Promise<unknown>) => {
		const error = await promise.catch((e) => e);
		if (isHttpError(error)) return error.status;
		throw new Error("Expected an HTTP error");
	};

	beforeAll(async () => {
		await db.run(sql`create table engineer (
			id integer primary key, organization_id text, name text, email text, phone text,
			specialty text, region text, hourly_rate integer, active integer, hired_at integer,
			user_id text
		)`);
		await db.run(sql`insert into engineer (id, organization_id, name, user_id) values
			(1, 'north', 'Eli', 'u1'),
			(2, 'south', 'Sam', 'u2'),
			(3, 'north', 'Kim', null)`);
	});

	test("are refused by the office's remote functions with a 403", () => {
		Object.assign(locals, { user, tenant: fieldEngineer });
		expect(statusOf(requireMember)).toBe(403);
		expect(statusOf(() => requireRole("engineer"))).toBe(403);
	});

	test("are still in their tenant, for the portal's queries", () => {
		Object.assign(locals, { user, tenant: fieldEngineer });
		expect(requireTenant()).toEqual({ user, ...fieldEngineer });
		expect(new SQLiteSyncDialect().sqlToQuery(inTenant(customer)).params).toEqual(["north"]);
	});

	test("get their engineer record in the tenant", async () => {
		Object.assign(locals, { user, tenant: fieldEngineer });
		expect(await requireEngineer()).toMatchObject({
			organizationId: "north",
			engineer: { id: 1, name: "Eli" },
		});
	});

	test("are refused by the portal while their account isn't linked in this tenant", async () => {
		// u2 is linked in South only.
		Object.assign(locals, { user: { id: "u2", name: "Sam" }, tenant: fieldEngineer });
		expect(await rejection(requireEngineer())).toBe(403);
		locals.user = { id: "u3", name: "Lou" };
		expect(await rejection(requireEngineer())).toBe(403);
		delete locals.user;
		expect(await rejection(requireEngineer())).toBe(401);
	});

	test("may also work in the office when they have an office role", () => {
		Object.assign(locals, { user, tenant: { ...tenant, roles: ["engineer", "member"] } });
		expect(requireMember()).toMatchObject({ organizationId: "north" });
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

describe("requireManager", () => {
	test("returns the tenant for an owner or an admin", () => {
		for (const role of ["owner", "admin"]) {
			Object.assign(locals, { user, tenant: { ...tenant, roles: ["member", role] } });
			expect(requireManager()).toMatchObject({ organizationId: "north" });
		}
	});

	test("refuses anyone else with a 403", () => {
		Object.assign(locals, { user, tenant });
		expect(statusOf(requireManager)).toBe(403);
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

describe("idInTenant and idsInTenant", () => {
	const dialect = new SQLiteSyncDialect();

	test("match a record by id and by the current tenant", () => {
		Object.assign(locals, { user, tenant });
		expect(dialect.sqlToQuery(idInTenant(customer, 7))).toMatchObject({
			sql: '("customer"."id" = ? and "customer"."organization_id" = ?)',
			params: [7, "north"],
		});
		expect(dialect.sqlToQuery(idsInTenant(customer, [7, 8]))).toMatchObject({
			sql: '("customer"."id" in (?, ?) and "customer"."organization_id" = ?)',
			params: [7, 8, "north"],
		});
	});

	test("refuse to build a query outside a tenant", () => {
		locals.user = user;
		expect(statusOf(() => idInTenant(customer, 7))).toBe(403);
		expect(statusOf(() => idsInTenant(customer, [7]))).toBe(403);
	});
});

describe("tenantJoin", () => {
	test("joins a table through a foreign key, kept in the tenant", () => {
		Object.assign(locals, { user, tenant });
		const query = db
			.select({ id: order.id })
			.from(order)
			.leftJoin(...tenantJoin(engineer, order.engineerId))
			.toSQL();
		expect(query.sql).toContain(
			'left join "engineer" on ("order"."engineer_id" = "engineer"."id" and "engineer"."organization_id" = ?)',
		);
		expect(query.params).toEqual(["north"]);
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
			('south', 'retired'),
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

	test("ignores a module the app no longer has", async () => {
		const found = await loadTenant("jo", "south");
		expect(found?.modules).toEqual(["contracts"]);
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
