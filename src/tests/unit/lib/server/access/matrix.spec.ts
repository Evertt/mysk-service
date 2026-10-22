/**
 * The access rules on the seeded database: for each subject type with a rule and each audience, who
 * may read and change which records. The expected answers come from SQL of the spec's own, not from
 * the scopes the rules are made of.
 *
 * - North's records are readable by North's audiences per the rule, and South's ids are not;
 * - another engineer's order and another customer's order are not readable;
 * - a site-limited contact sees only their sites' records;
 * - a manager's types are not readable by the other office members.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	changeable,
	changeOrNotFound,
	mayChange,
	mayRead,
	readable,
	readOrNotFound,
	visible,
} from "#lib/server/access/index.ts";
import type { Actor } from "#unit/lib/server/harness/actors.ts";
import { as, asSystem, north, rows, south, value } from "#unit/lib/server/harness/index.ts";

import {
	contactOf,
	customerIdOf,
	engineerIdOf,
	idsOf,
	keys,
	readOneByOne,
	sitesOfOrdersOf,
	subjects,
} from "./support.ts";

/** The tables of the core's subject types that have a row of their own, by type. */
const tables = {
	order: "order",
	customer: "customer",
	site: "customer_site",
	engineer: "engineer",
	equipment: "equipment",
	location: "equipment_location",
	equipment_category: "equipment_category",
} as const;

describe("the office", () => {
	for (const [type, table] of Object.entries(tables)) {
		test(`reads its tenant's ${type} records, and not South's`, async () => {
			const own = (await idsOf(table, "org-north")).slice(0, 12);
			const others = (await idsOf(table, "org-south")).slice(0, 12);
			expect(own.length).toBeGreaterThan(0);
			expect(others.length).toBeGreaterThan(0);
			expect(await readOneByOne(north.member, type, own)).toEqual(own);
			expect(await readOneByOne(north.member, type, others)).toEqual([]);
			expect(await as(north.member, () => readable(subjects(type, own)))).toEqual(keys(type, own));
		});
	}

	test("knows no type that has no rule, and a missing id is a 404", async () => {
		await as(north.member, async () => {
			expect(await mayRead({ type: "no_such_type", id: "1" })).toBe(false);
			expect(await mayRead({ type: "order", id: "999999" })).toBe(false);
			expect(await mayRead({ type: "order", id: "abc" })).toBe(false);
			await expect(readOrNotFound({ type: "order", id: "999999" })).rejects.toMatchObject({
				status: 404,
			});
			expect(await visible("no_such_type")).toBeUndefined();
		});
	});

	test("hides the members, invitations, contacts and tokens from all but managers", async () => {
		const member = await idsOf("member", "org-north");
		const contacts = await idsOf("portal_contact", "org-north");
		const [owner] = await rows<{ id: string }>(`select u.id from user u where u.email = ?`, [
			north.owner.email,
		]);
		await rows(
			`insert into invitation (id, organization_id, email, status, expires_at, inviter_id)
			 values ('inv-north', 'org-north', 'new@north.example', 'pending', 4102444800000, ?)`,
			[owner.id],
		);
		await rows(
			`insert into integration_token (organization_id, module_id, name, token_hash, prefix)
			 values ('org-north', 'docks', 'Salvo', 'hash-north', 'fwi_north')`,
		);
		const invitation = ["inv-north"];
		const token = await idsOf("integration_token", "org-north");
		const cases = { member, invitation, portal_contact: contacts, integration_token: token };
		for (const [type, ids] of Object.entries(cases)) {
			expect(ids.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(north.owner, type, ids), type).toEqual(ids);
			expect(await readOneByOne(north.admin, type, ids), type).toEqual(ids);
			expect(await readOneByOne(north.member, type, ids), type).toEqual([]);
			expect(await readOneByOne(north.engineer, type, ids), type).toEqual([]);
			expect(await readOneByOne(north.customer, type, ids), type).toEqual([]);
			expect(await as(north.member, () => readable(subjects(type, ids))), type).toEqual(new Set());
		}
	});

	test("changes what it reads, the tenant's settings only as a manager", async () => {
		const [categoryId] = await idsOf("equipment_category", "org-north");
		await as(north.member, async () => {
			expect(await mayChange({ type: "order", id: (await idsOf("order", "org-north"))[0] })).toBe(
				true,
			);
			expect(await mayChange({ type: "equipment_category", id: categoryId })).toBe(false);
			expect(await mayChange({ type: "order_type", id: "service" })).toBe(false);
			expect(await mayChange({ type: "module", id: "docks" })).toBe(false);
			await expect(changeOrNotFound({ type: "module", id: "docks" })).rejects.toMatchObject({
				status: 404,
			});
		});
		await as(north.owner, async () => {
			expect(await mayChange({ type: "equipment_category", id: categoryId })).toBe(true);
			expect(await mayChange({ type: "order_type", id: "service" })).toBe(true);
			expect(await mayChange({ type: "module", id: "docks" })).toBe(true);
		});
	});

	test("reads the settings types without a row", async () => {
		await as(north.member, async () => {
			expect(await mayRead({ type: "module", id: "docks" })).toBe(true);
			expect(await mayRead({ type: "order_type", id: "service" })).toBe(true);
		});
	});
});

describe("saved views", () => {
	test("are their owner's, and the office's when shared (managers change those)", async () => {
		const [owner] = await rows<{ id: string }>(`select id from user where email = ?`, [
			north.owner.email,
		]);
		const [planner] = await rows<{ id: string }>(`select id from user where email = ?`, [
			north.member.email,
		]);
		await rows(
			`insert into saved_view (organization_id, user_id, table_key, name, query, shared)
			 values ('org-north', ?, '/(app)/orders', 'Mine', '?a=1', 0),
			        ('org-north', ?, '/(app)/orders', 'Shared', '?a=2', 1),
			        ('org-north', ?, '/(app)/orders', 'Private', '?a=3', 0)`,
			[planner.id, planner.id, owner.id],
		);
		const named = async (name: string) =>
			String(await value<number>(`select id from saved_view where name = ?`, [name]));
		const [mine, shared, private_] = [
			await named("Mine"),
			await named("Shared"),
			await named("Private"),
		];
		const asks = (actor: Actor, which: "read" | "change") =>
			as(actor, async () => {
				const ask = which === "read" ? mayRead : mayChange;
				return [
					await ask({ type: "saved_view", id: mine }),
					await ask({ type: "saved_view", id: shared }),
					await ask({ type: "saved_view", id: private_ }),
				];
			});
		// The planner reads their two, not the owner's private one; the owner reads the shared one.
		expect(await asks(north.member, "read")).toEqual([true, true, false]);
		expect(await asks(north.owner, "read")).toEqual([false, true, true]);
		expect(await asks(north.member, "change")).toEqual([true, true, false]);
		expect(await asks(north.owner, "change")).toEqual([false, true, true]);
		expect(await asks(north.engineer, "read")).toEqual([false, false, false]);
		expect(await asks(south.owner, "read")).toEqual([false, false, false]);
	});
});

describe("a field engineer", () => {
	const engineerOf = () => engineerIdOf(north.engineer);

	test("reads their own orders, in any status, and no one else's", async () => {
		const me = String(await engineerOf());
		const all = await idsOf("order", "org-north");
		const mine = await idsOf("order", "org-north", "and engineer_id = ?", [me]);
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.length).toBeLessThan(all.length);
		expect(await readOneByOne(north.engineer, "order", all)).toEqual(mine);
		expect(await as(north.engineer, () => readable(subjects("order", all)))).toEqual(
			keys("order", mine),
		);
		expect(await as(north.engineer, () => changeable(subjects("order", all)))).toEqual(
			keys("order", mine),
		);
		const southOrders = await idsOf("order", "org-south");
		expect(await readOneByOne(north.engineer, "order", southOrders)).toEqual([]);
	});

	test("reads every unit, location and customer of the tenant, and their own record", async () => {
		const me = String(await engineerOf());
		for (const type of ["equipment", "location", "customer", "equipment_category"]) {
			const own = (await idsOf(tables[type as keyof typeof tables] ?? type, "org-north")).slice(
				0,
				8,
			);
			expect(await readOneByOne(north.engineer, type, own), type).toEqual(own);
			const others = (await idsOf(tables[type as keyof typeof tables] ?? type, "org-south")).slice(
				0,
				8,
			);
			expect(await readOneByOne(north.engineer, type, others), type).toEqual([]);
		}
		const engineers = await idsOf("engineer", "org-north");
		expect(await readOneByOne(north.engineer, "engineer", engineers)).toEqual([me]);
	});

	/** An order of a North customer with `sites` sites, not the engineer's, its units taken off. */
	async function bareOrder(sites: number) {
		const [found] = await rows<{ id: number; customer_id: number }>(
			`select o.id, o.customer_id from "order" o where o.organization_id = 'org-north'
			 and (select count(*) from customer_site s where s.customer_id = o.customer_id) = ?
			 order by o.id desc limit 1`,
			[sites],
		);
		await rows(`delete from order_unit where order_id = ?`, [found.id]);
		return found;
	}

	test("reads the sites of their orders, and no other", async () => {
		const me = await engineerOf();
		const [one, two] = [await bareOrder(1), await bareOrder(2)];
		await rows(`update "order" set engineer_id = ? where id in (?, ?)`, [me, one.id, two.id]);
		const theirs = await sitesOfOrdersOf(me);
		const all = await idsOf("customer_site", "org-north");
		// An order without units is at its customer's site if it has only one.
		const only = await value<number>(`select id from customer_site where customer_id = ?`, [
			one.customer_id,
		]);
		expect(theirs).toContain(String(only));
		expect(theirs.length).toBeLessThan(all.length);
		expect(await readOneByOne(north.engineer, "site", all)).toEqual(theirs);
		expect(await as(north.engineer, () => readable(subjects("site", all)))).toEqual(
			keys("site", theirs),
		);
		const southSites = await idsOf("customer_site", "org-south");
		expect(await readOneByOne(north.engineer, "site", southSites)).toEqual([]);
	});

	test("changes nothing of a unit, a customer or the settings", async () => {
		const [unit] = await idsOf("equipment", "org-north");
		await as(north.engineer, async () => {
			expect(await mayChange({ type: "equipment", id: unit })).toBe(false);
			expect(await mayChange({ type: "order_type", id: "service" })).toBe(false);
			expect(await mayRead({ type: "order_type", id: "service" })).toBe(true);
			expect(await mayRead({ type: "module", id: "docks" })).toBe(false);
		});
	});
});

describe("a customer's contact", () => {
	const customerOf = () => customerIdOf(north.customer);

	test("reads their customer's orders, units, sites and locations, and no one else's", async () => {
		const mine = await customerOf();
		const byCustomer = (table: string, column: string) =>
			Promise.all([
				idsOf(table, "org-north", `and ${column} = ?`, [String(mine)]),
				idsOf(table, "org-north", `and ${column} != ?`, [String(mine)]),
			]);
		const cases: [string, string, string][] = [
			["order", "order", "customer_id"],
			["equipment", "equipment", "customer_id"],
			["site", "customer_site", "customer_id"],
			["customer", "customer", "id"],
		];
		for (const [type, table, column] of cases) {
			const [own, others] = await byCustomer(table, column);
			expect(own.length, type).toBeGreaterThan(0);
			expect(others.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(north.customer, type, own), type).toEqual(own);
			expect(await readOneByOne(north.customer, type, others), type).toEqual([]);
		}
		const locations = await idsOf(
			"equipment_location",
			"org-north",
			`and site_id in (select id from customer_site where customer_id = ?)`,
			[String(mine)],
		);
		const otherLocations = await idsOf(
			"equipment_location",
			"org-north",
			`and site_id in (select id from customer_site where customer_id != ?)`,
			[String(mine)],
		);
		expect(await readOneByOne(north.customer, "location", locations)).toEqual(locations);
		expect(await readOneByOne(north.customer, "location", otherLocations)).toEqual([]);
	});

	test("reads no engineers, changes nothing", async () => {
		const engineers = await idsOf("engineer", "org-north");
		expect(await readOneByOne(north.customer, "engineer", engineers)).toEqual([]);
		const [order] = await idsOf("order", "org-north");
		await as(north.customer, async () => {
			expect(await mayChange({ type: "order", id: order })).toBe(false);
			expect(await mayRead({ type: "order_type", id: "service" })).toBe(true);
			expect(await mayRead({ type: "simulation", id: "docks" })).toBe(false);
		});
	});

	test("limited to some sites, reads only those sites' records", async () => {
		// North's customer contact, moved to a customer with units at several sites.
		const contactor = north.customer;
		const contact = await contactOf(contactor);
		const [multi] = await rows<{ customer_id: number }>(
			`select customer_id from equipment where organization_id = 'org-north'
			 group by customer_id having count(distinct site_id) > 1 order by customer_id limit 1`,
		);
		expect(multi, "a North customer with units at two sites").toBeDefined();
		const mine = String(multi.customer_id);
		await rows(`update portal_contact set customer_id = ? where id = ?`, [mine, contact.id]);
		const sitesWithUnits = await rows<{ site_id: number }>(
			`select distinct site_id from equipment where organization_id = 'org-north' and customer_id = ? order by site_id`,
			[mine],
		);
		const kept = sitesWithUnits[0].site_id;
		await rows(`update portal_contact set all_sites = 0 where id = ?`, [contact.id]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values ('org-north', ?, ?, ?)`,
			[contact.id, mine, kept],
		);
		const units = (where: string) =>
			idsOf("equipment", "org-north", `and customer_id = ? and ${where}`, [mine]);
		const own = await units(`site_id = ${kept}`);
		const others = await units(`site_id != ${kept}`);
		expect(own.length).toBeGreaterThan(0);
		expect(others.length).toBeGreaterThan(0);
		expect(await readOneByOne(contactor, "equipment", own)).toEqual(own);
		expect(await readOneByOne(contactor, "equipment", others)).toEqual([]);
		const sites = await idsOf("customer_site", "org-north", "and customer_id = ?", [mine]);
		expect(await readOneByOne(contactor, "site", sites)).toEqual([String(kept)]);
		const withUnitHere = await idsOf(
			"order",
			"org-north",
			`and customer_id = ? and id in (select order_id from order_unit where equipment_id in
				(select id from equipment where site_id = ?))`,
			[mine, String(kept)],
		);
		const orders = await idsOf("order", "org-north", "and customer_id = ?", [mine]);
		expect(withUnitHere.length).toBeGreaterThan(0);
		expect(withUnitHere.length).toBeLessThan(orders.length);
		expect(await readOneByOne(contactor, "order", orders)).toEqual(withUnitHere);
	});
});

describe("the system", () => {
	test("reads and changes its tenant's records, not another's", async () => {
		const own = (await idsOf("order", "org-north")).slice(0, 5);
		const others = (await idsOf("order", "org-south")).slice(0, 5);
		await asSystem("north", async () => {
			for (const id of own) {
				expect(await mayRead({ type: "order", id })).toBe(true);
				expect(await mayChange({ type: "order", id })).toBe(true);
			}
			for (const id of others) expect(await mayRead({ type: "order", id })).toBe(false);
			expect(await mayChange({ type: "order_type", id: "service" })).toBe(true);
		});
	});
});
