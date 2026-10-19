import { isHttpError } from "@sveltejs/kit";
import { sql } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
	currentCustomer,
	currentEngineer,
	currentTenant,
	currentUser,
	idInTenant,
	idsInTenant,
	inTenant,
	loadTenant,
	requireCustomer,
	requireEngineer,
	requireManager,
	requireMember,
	requireModule,
	requireRole,
	requireTenant,
	requireUser,
	type Tenant,
	tenantJoin,
} from "#lib/server/auth/session.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, order } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};

/** The request in progress: a new one for each test (the engineer is looked up once per request). */
let event = { locals };
vi.mock("$app/server", () => ({ getRequestEvent: () => event }));
const nextRequest = () => {
	event = { locals };
};

// The made-up graph of modules, in which `core-ish` is always on and `addon` requires `base`.
vi.mock("#lib/modules/ids.ts", async (importOriginal) => ({
	...(await importOriginal<typeof import("#lib/modules/ids.ts")>()),
	moduleGraph: (await import("#unit/lib/modules/fakes.ts")).fakeGraph,
}));

// An in-memory database instead of the app's, which needs `DATABASE_URL`.
vi.mock("#lib/server/db/index.ts", async () => {
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
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
	nextRequest();
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
		nextRequest();
		locals.user = { id: "u3", name: "Lou" };
		expect(await rejection(requireEngineer())).toBe(403);
		nextRequest();
		delete locals.user;
		expect(await rejection(requireEngineer())).toBe(401);
	});

	test("are looked up once per request, so the gate and the handler share the lookup", async () => {
		Object.assign(locals, { user, tenant: fieldEngineer });
		const lookup = vi.spyOn(db.query.engineer, "findFirst");
		expect(await currentEngineer()).toMatchObject({ name: "Eli" });
		expect(await currentEngineer()).not.toHaveProperty("id");
		await requireEngineer();
		expect(lookup).toHaveBeenCalledTimes(1);
		nextRequest();
		await currentEngineer();
		expect(lookup).toHaveBeenCalledTimes(2);
		lookup.mockRestore();
	});

	test("may also work in the office when they have an office role", () => {
		Object.assign(locals, { user, tenant: { ...tenant, roles: ["engineer", "member"] } });
		expect(requireMember()).toMatchObject({ organizationId: "north" });
	});
});

describe("in a gated remote function", () => {
	test("currentTenant reads the tenant without checking the role again", () => {
		Object.assign(locals, { user, tenant: { ...tenant, roles: ["engineer"] } });
		expect(currentTenant()).toMatchObject({ user, organizationId: "north" });
	});

	test("currentUser reads the signed-in user", () => {
		locals.user = user;
		expect(currentUser()).toBe(user);
	});

	test("still refuses where no gate let anyone in", () => {
		expect(statusOf(currentUser)).toBe(401);
		locals.user = user;
		expect(statusOf(currentTenant)).toBe(403);
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

describe("customers' contacts", () => {
	const contact = { ...tenant, roles: ["customer"] };

	/** The status of the HTTP error a promise rejects with. */
	const rejection = async (promise: Promise<unknown>) => {
		const error = await promise.catch((e) => e);
		if (isHttpError(error)) return error.status;
		throw new Error("Expected an HTTP error");
	};

	beforeAll(async () => {
		await db.run(sql`create table if not exists customer (
			id integer primary key, organization_id text, code text, name text
		)`);
		await db.run(sql`insert into customer (id, organization_id, code, name) values
			(1, 'north', 'CUST-0001', 'Riedel'), (2, 'north', 'CUST-0002', 'Vermeer'),
			(3, 'south', 'CUST-0003', 'Zuid')`);
		await db.run(sql`create table portal_contact (
			id integer primary key, organization_id text, customer_id integer, email text,
			user_id text, invitation_id text, all_sites integer, created_at integer
		)`);
		await db.run(sql`create table portal_contact_site (
			organization_id text, contact_id integer, customer_id integer, site_id integer
		)`);
		await db.run(sql`insert into portal_contact (id, organization_id, customer_id, email, user_id, all_sites) values
			(1, 'north', 1, 'c1@example.com', 'c1', 1),
			(2, 'north', 2, 'c2@example.com', 'c2', 0),
			(3, 'south', 3, 'c3@example.com', 'c3', 1)`);
		await db.run(sql`insert into portal_contact_site values
			('north', 2, 2, 21), ('north', 2, 2, 22), ('south', 3, 3, 31)`);
	});

	test("are refused by the office's remote functions with a 403", () => {
		Object.assign(locals, { user: { id: "c1", name: "Cas" }, tenant: contact });
		expect(statusOf(requireMember)).toBe(403);
		expect(statusOf(requireManager)).toBe(403);
		expect(statusOf(() => requireModule("contracts"))).toBe(403);
	});

	test("aren't field engineers either", async () => {
		Object.assign(locals, { user: { id: "c1", name: "Cas" }, tenant: contact });
		await db.run(sql`create table if not exists engineer (
			id integer primary key, organization_id text, name text, email text, phone text,
			specialty text, region text, hourly_rate integer, active integer, hired_at integer,
			user_id text
		)`);
		expect(await rejection(requireEngineer())).toBe(403);
	});

	test("get their customer, seeing all of its sites", async () => {
		Object.assign(locals, { user: { id: "c1", name: "Cas" }, tenant: contact });
		expect(await requireCustomer()).toMatchObject({
			organizationId: "north",
			contactId: 1,
			customer: { id: 1, code: "CUST-0001", name: "Riedel" },
			siteIds: null,
		});
		expect(await currentCustomer()).toEqual({
			contactId: 1,
			customer: { id: 1, code: "CUST-0001", name: "Riedel" },
			siteIds: null,
		});
	});

	test("limited to some sites get only those", async () => {
		Object.assign(locals, { user: { id: "c2", name: "Cor" }, tenant: contact });
		expect((await currentCustomer()).siteIds?.toSorted()).toEqual([21, 22]);
	});

	test("are refused unless linked to a customer in this tenant, or with another role", async () => {
		// c3 is a contact in South only.
		Object.assign(locals, { user: { id: "c3", name: "Zoë" }, tenant: contact });
		expect(await rejection(requireCustomer())).toBe(403);
		nextRequest();
		// An office member who's linked isn't a customer's contact.
		Object.assign(locals, { user: { id: "c1", name: "Cas" }, tenant });
		expect(await rejection(requireCustomer())).toBe(403);
		nextRequest();
		delete locals.user;
		expect(await rejection(requireCustomer())).toBe(401);
	});

	test("are looked up once per request", async () => {
		Object.assign(locals, { user: { id: "c1", name: "Cas" }, tenant: contact });
		const lookup = vi.spyOn(db.query.portalContact, "findFirst");
		await requireCustomer();
		await currentCustomer();
		expect(lookup).toHaveBeenCalledTimes(1);
		lookup.mockRestore();
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
			// The ids in one parameter, whatever their number (see `inList()`).
			sql: '("customer"."id" in (select value from json_each(?)) and "customer"."organization_id" = ?)',
			params: ["[7,8]", "north"],
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
		await db.run(
			sql`create table order_type_setting (organization_id text, type text, names text, hidden integer)`,
		);
		await db.run(sql`insert into organization (id, name, slug) values
			('north', 'North Facilities', 'north'),
			('south', 'South Services', 'south'),
			('east', 'East Engineering', 'east')`);
		await db.run(sql`insert into member (id, organization_id, user_id, role, created_at) values
			('m1', 'south', 'jo', 'member', 2000),
			('m2', 'north', 'jo', 'admin, member', 1000),
			('m3', 'east', 'sam', 'owner', 1000)`);
		await db.run(sql`insert into organization_module (organization_id, module_id) values
			('south', 'base'),
			('south', 'retired'),
			('east', 'addon')`);
		await db.run(sql`insert into order_type_setting (organization_id, type, names, hidden) values
			('north', 'survey', '{"nl":"Offerte-opname"}', 0),
			('north', 'damage', '{}', 1)`);
	});

	test("uses the active organization", async () => {
		expect(await loadTenant("jo", "south")).toEqual({
			organizationId: "south",
			name: "South Services",
			slug: "south",
			roles: ["member"],
			modules: ["base", "core-ish"],
			orderTypes: {},
		});
	});

	test("loads the organization's order type settings, and no other's", async () => {
		expect((await loadTenant("jo", "north"))?.orderTypes).toEqual({
			survey: { names: { nl: "Offerte-opname" }, hidden: false },
			damage: { names: {}, hidden: true },
		});
		expect((await loadTenant("jo", "south"))?.orderTypes).toEqual({});
	});

	test("ignores a module the app no longer has", async () => {
		const found = await loadTenant("jo", "south");
		expect(found?.modules).toEqual(["base", "core-ish"]);
	});

	test("leaves out a module whose requirement is off, and adds the always-on ones", async () => {
		// East has a row for `addon` only, which requires `base`.
		const found = await loadTenant("sam", "east");
		expect(found?.modules).toEqual(["core-ish"]);
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
			modules: ["core-ish"],
		});
	});

	test("is undefined for a user without memberships", async () => {
		expect(await loadTenant("nobody", "north")).toBeUndefined();
	});
});
