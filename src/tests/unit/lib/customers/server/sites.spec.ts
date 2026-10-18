import { rmSync } from "node:fs";

import { isHttpError, isValidationError } from "@sveltejs/kit";
import { asc, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { removingSite } from "#lib/customers/extensions.ts";
import type { SiteInput } from "#lib/customers/form/site-schema.ts";
import { createSite, removeSite, updateSite } from "#lib/customers/server/sites.ts";
import type { Tenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customerSite } from "#lib/server/db/schema.ts";
import { contribute, defineServerModule, type ServerModule } from "#lib/server/extensions.ts";

const locals: { user?: { id: string; name: string }; tenant?: Tenant } = {};
const logged = vi.fn();

vi.mock("$app/server", () => ({ getRequestEvent: () => ({ locals }) }));
vi.mock("#lib/server/activity/index.ts", () => ({
	recordActivity: (_tx: unknown, record: unknown) => logged(record),
}));
// Made-up modules `a` and `b` instead of the ones in `src/modules`.
const registry = vi.hoisted(() => ({ modules: [] as ServerModule[] }));
vi.mock("#lib/server/modules/hooks.gen.ts", () => ({
	generatedServerModules: () => registry.modules,
}));

// A temporary database with the tables the service touches. Not an in-memory one: libsql gives a
// transaction a connection of its own, which wouldn't see it.
const folder = await vi.hoisted(async () => {
	const [fs, os, path] = await Promise.all([
		import("node:fs"),
		import("node:os"),
		import("node:path"),
	]);
	return fs.mkdtempSync(path.join(os.tmpdir(), "sites-spec-"));
});
vi.mock("#lib/server/db/index.ts", async () => {
	const path = await import("node:path");
	const { createClient } = await import("@libsql/client");
	const { drizzle } = await import("drizzle-orm/libsql");
	const schema = await import("#lib/server/db/schema.ts");
	const client = createClient({ url: `file:${path.join(folder, "test.db")}` });
	await client.executeMultiple(`
		create table customer (
			id integer primary key, organization_id text not null, code text not null,
			unique (organization_id, id)
		);
		create table customer_site (
			id integer primary key autoincrement, organization_id text not null,
			customer_id integer not null, name text not null, address text default '' not null,
			postal_code text default '' not null, city text not null, country text not null,
			contact_name text, contact_phone text, contact_email text, contact_channel text,
			preferred_day text, slot_start text, slot_end text,
			priority text default 'normal' not null, access_notes text,
			created_at integer default (unixepoch()) not null,
			unique (customer_id, id),
			foreign key (organization_id, customer_id) references customer (organization_id, id)
		);
		create table equipment (
			id integer primary key, organization_id text not null, customer_id integer not null,
			site_id integer not null,
			foreign key (customer_id, site_id) references customer_site (customer_id, id)
		);
		insert into customer values (1, 'north', 'CUST-0001'), (2, 'north', 'CUST-0002'),
			(3, 'south', 'CUST-0003');
	`);
	return { db: drizzle(client, { schema }) };
});

afterAll(() => {
	db.$client.close();
	rmSync(folder, { recursive: true, force: true });
});

const tenant = (organizationId: string, modules: string[] = []): Tenant => ({
	organizationId,
	name: organizationId,
	slug: organizationId,
	roles: ["member"],
	modules,
});

const input = (fields: Partial<SiteInput> = {}): SiteInput => ({
	name: "Ede",
	address: "Galvanistraat 1",
	postalCode: "6716 AE",
	city: "Ede",
	country: "Netherlands",
	contactName: null,
	contactPhone: null,
	contactEmail: null,
	contactChannel: null,
	preferredDay: null,
	slotStart: null,
	slotEnd: null,
	priority: "normal",
	accessNotes: null,
	...fields,
});

beforeEach(async () => {
	locals.user = { id: "u1", name: "Jo" };
	locals.tenant = tenant("north");
	logged.mockClear();
	registry.modules = [];
	await db.run(sql`delete from equipment`);
	await db.run(sql`delete from customer_site`);
	await db.run(sql`insert into customer_site (id, organization_id, customer_id, name, city, country)
		values (10, 'north', 1, 'Utrecht', 'Utrecht', 'Netherlands'),
			(11, 'north', 1, 'Ede', 'Ede', 'Netherlands'),
			(20, 'north', 2, 'Zwolle', 'Zwolle', 'Netherlands'),
			(30, 'south', 3, 'Breda', 'Breda', 'Netherlands')`);
	await db.run(sql`insert into equipment values (100, 'north', 1, 10), (300, 'south', 3, 30)`);
});

const sites = () =>
	db
		.select({ id: customerSite.id, customerId: customerSite.customerId, name: customerSite.name })
		.from(customerSite)
		.orderBy(asc(customerSite.id));

/** How `change` failed: its status for an HTTP error, its messages when refused. */
async function failure(change: () => Promise<unknown>) {
	try {
		await change();
		return null;
	} catch (error) {
		if (isHttpError(error)) return error.status;
		if (isValidationError(error)) return error.issues.map((issue) => issue.message);
		throw error;
	}
}

describe("createSite", () => {
	test("adds a site to the tenant's customer and logs it with the customer", async () => {
		const code = await createSite(2, input({ name: "Apeldoorn", city: "Apeldoorn" }));
		expect(code).toBe("CUST-0002");
		const [added] = (await sites()).filter((site) => site.name === "Apeldoorn");
		expect(added).toMatchObject({ customerId: 2 });
		const [row] = await db
			.select()
			.from(customerSite)
			.where(sql`id = ${added.id}`);
		expect(row).toMatchObject({ organizationId: "north", address: "Galvanistraat 1" });
		expect(logged).toHaveBeenCalledWith({
			action: "created",
			subject: { type: "site", id: added.id, label: "Apeldoorn" },
			parent: { type: "customer", id: 2, label: "CUST-0002" },
		});
	});

	test("another tenant's customer is a 404, and nothing is added", async () => {
		expect(await failure(() => createSite(3, input()))).toBe(404);
		expect(await sites()).toHaveLength(4);
		expect(logged).not.toHaveBeenCalled();
	});
});

describe("updateSite", () => {
	test("changes the tenant's site and logs what it was", async () => {
		const changes = input({ name: "Ede-Noord", slotStart: "07:00", slotEnd: "15:00" });
		expect(await updateSite(11, changes)).toBe("CUST-0001");
		const [row] = await db
			.select()
			.from(customerSite)
			.where(sql`id = 11`);
		expect(row).toMatchObject({ name: "Ede-Noord", slotStart: "07:00", slotEnd: "15:00" });
		expect(logged).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "updated",
				subject: { type: "site", id: 11, label: "Ede-Noord" },
				parent: { type: "customer", id: 1, label: "CUST-0001" },
				before: expect.objectContaining({ name: "Ede" }),
				after: changes,
			}),
		);
	});

	test("another tenant's site is a 404, also by its id, and stays as it was", async () => {
		expect(await failure(() => updateSite(30, input({ name: "Taken" })))).toBe(404);
		expect((await sites()).find((site) => site.id === 30)?.name).toBe("Breda");
	});
});

describe("removeSite", () => {
	test("deletes a site without equipment and logs it", async () => {
		expect(await removeSite(11)).toBe("CUST-0001");
		expect((await sites()).map((site) => site.id)).toEqual([10, 20, 30]);
		expect(logged).toHaveBeenCalledWith({
			action: "deleted",
			subject: { type: "site", id: 11, label: "Ede" },
			parent: { type: "customer", id: 1, label: "CUST-0001" },
		});
	});

	test("refuses a site with equipment at it", async () => {
		expect(await failure(() => removeSite(10))).toEqual([
			"This site still has 1 equipment unit. Move it to another site first.",
		]);
		expect(await sites()).toHaveLength(4);
	});

	test("refuses a customer's last site", async () => {
		expect(await failure(() => removeSite(20))).toEqual([
			"A customer keeps at least one site. Add another before deleting this one.",
		]);
		expect(logged).not.toHaveBeenCalled();
	});

	test("asks the tenant's modules in its transaction, and keeps a site one of them refuses", async () => {
		locals.tenant = tenant("north", ["a", "b"]);
		const asked = vi.fn();
		registry.modules = [
			defineServerModule("a" as never, [
				contribute(removingSite, async ({ tx, site }) => {
					asked(site);
					// What it has at the site, read in core's transaction: here, the site itself.
					const [row] = await tx
						.select({ id: customerSite.id })
						.from(customerSite)
						.where(sql`id = ${site.id}`);
					return row ? "This site has 2 docks. Delete them first." : undefined;
				}),
			]),
			defineServerModule("b" as never, [contribute(removingSite, async () => undefined)]),
		];
		expect(await failure(() => removeSite(11))).toEqual([
			"This site has 2 docks. Delete them first.",
		]);
		expect(asked).toHaveBeenCalledWith({ id: 11, customerId: 1 });
		expect(await sites()).toHaveLength(4);
		expect(logged).not.toHaveBeenCalled();
	});

	test("a module that's off isn't asked", async () => {
		locals.tenant = tenant("north", ["b"]);
		registry.modules = [
			defineServerModule("a" as never, [contribute(removingSite, async () => "Refused")]),
		];
		expect(await removeSite(11)).toBe("CUST-0001");
		expect((await sites()).map((site) => site.id)).toEqual([10, 20, 30]);
	});

	test("another tenant's site is a 404", async () => {
		await db.run(sql`delete from equipment where id = 300`);
		expect(await failure(() => removeSite(30))).toBe(404);
		expect(await sites()).toHaveLength(4);
	});
});
