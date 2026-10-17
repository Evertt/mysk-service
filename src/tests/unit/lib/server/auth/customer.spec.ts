import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { atSites, customerOrders, ofCustomer, seesSite } from "#lib/server/auth/customer.ts";
import type { CustomerAccess, Tenant } from "#lib/server/auth/session.ts";
import { customerSite, equipment } from "#lib/server/db/schema.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/db/index.ts", () => ({ db: {} }));

const dialect = new SQLiteSyncDialect();
const toQuery = (sql: Parameters<typeof dialect.sqlToQuery>[0] | undefined) =>
	sql ? dialect.sqlToQuery(sql) : undefined;

const allSites: CustomerAccess = {
	contactId: 1,
	customer: { id: 7, code: "CUST-0007", name: "Riedel" },
	siteIds: null,
};
const someSites: CustomerAccess = { ...allSites, siteIds: [21, 22] };

beforeEach(() => {
	locals.user = { id: "c1", name: "Cas" };
	locals.tenant = {
		organizationId: "north",
		name: "North",
		slug: "north",
		roles: ["customer"],
		modules: [],
	};
});

describe("ofCustomer", () => {
	test("keeps the tenant's records of the contact's customer", () => {
		expect(toQuery(ofCustomer(allSites, equipment))).toMatchObject({
			sql: '("equipment"."organization_id" = ? and "equipment"."customer_id" = ?)',
			params: ["north", 7],
		});
	});
});

describe("atSites", () => {
	test("is no condition for a contact of all sites", () => {
		expect(atSites(allSites, equipment.siteId)).toBeUndefined();
	});

	test("keeps the records at the contact's sites", () => {
		expect(toQuery(atSites(someSites, customerSite.id))).toMatchObject({
			sql: '"customer_site"."id" in (select value from json_each(?))',
			params: ["[21,22]"],
		});
	});

	test("says whether the contact sees a site", () => {
		expect(seesSite(allSites, 99)).toBe(true);
		expect(seesSite(someSites, 21)).toBe(true);
		expect(seesSite(someSites, 99)).toBe(false);
	});
});

describe("customerOrders", () => {
	test("are the customer's orders in the tenant for a contact of all sites", () => {
		expect(toQuery(customerOrders(allSites))).toMatchObject({
			sql: '("order"."organization_id" = ? and "order"."customer_id" = ?)',
			params: ["north", 7],
		});
	});

	test("need a unit at one of the contact's sites otherwise", () => {
		const query = toQuery(customerOrders(someSites))!;
		expect(query.sql).toContain('"order"."customer_id" = ?');
		expect(query.sql).toContain('exists (select 1 from "order_unit" inner join "equipment"');
		expect(query.sql).toContain('"equipment"."site_id" in (select value from json_each(?))');
		expect(query.params).toEqual(["north", 7, "north", "north", "[21,22]"]);
	});
});
