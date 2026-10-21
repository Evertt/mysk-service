/**
 * Who may read and change the parts shop's records (`server/access.ts`), on the seeded database as
 * SHLTR's people: the office reads and manages them (the categories are a manager's); a customer's
 * contact reads the catalogue and their customer's shop orders (not limited to sites, as the portal
 * reads them), never another customer's; and none of it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { contactOf, customerIdOf, idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import {
	as,
	demoAccount,
	north,
	rows,
	shltr,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");
const weggemans = demoAccount("rob@weggemans.example");

const types = [
	["shop_order", "shop_order"],
	["shop_product", "shop_product"],
	["shop_category", "shop_category"],
] as const;

describe("the office", () => {
	test("reads the records of its tenant, and another tenant's office none", async () => {
		for (const [type, table] of types) {
			const own = await idsOf(table, "org-shltr");
			expect(own.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(shltr.member, type, own), type).toEqual(own);
			expect(await readOneByOne(north.owner, type, own), type).toEqual([]);
		}
	});

	test("lets any member change orders and products, and only managers the categories", async () => {
		for (const [type, table] of types) {
			const [first] = await idsOf(table, "org-shltr");
			await as(shltr.member, async () => {
				expect(await mayChange({ type, id: first }), type).toBe(type !== "shop_category");
			});
			await as(shltr.owner, async () => {
				expect(await mayChange({ type, id: first }), type).toBe(true);
			});
		}
	});

	test("finds none of them in a tenant without the module", async () => {
		const sample = await Promise.all(
			types.map(async ([type, table]) => ({ type, id: (await idsOf(table, "org-shltr"))[0] })),
		);
		await withoutModule("shltr", "parts-shop", async () => {
			await as(shltr.owner, async () => {
				for (const subject of sample) expect(await mayRead(subject), subject.type).toBe(false);
			});
		});
	});
});

describe("a field engineer", () => {
	test("reads none of them", async () => {
		for (const [type, table] of types) {
			expect(await readOneByOne(shltr.engineer, type, await idsOf(table, "org-shltr"))).toEqual([]);
		}
	});
});

describe("a customer's contact", () => {
	test("reads the whole catalogue and its categories, and changes none", async () => {
		for (const [type, table] of types.slice(1)) {
			const all = await idsOf(table, "org-shltr");
			expect(await readOneByOne(riedel, type, all), type).toEqual(all);
			await as(riedel, async () => {
				expect(await mayChange({ type, id: all[0] }), type).toBe(false);
			});
		}
	});

	test("reads their customer's shop orders, no one else's", async () => {
		const customer = await customerIdOf(riedel);
		const all = await idsOf("shop_order", "org-shltr");
		const mine = await idsOf("shop_order", "org-shltr", "and customer_id = ?", [customer]);
		expect(mine.length).toBeGreaterThan(0);
		expect(await readOneByOne(riedel, "shop_order", all)).toEqual(mine);
		expect(await readOneByOne(weggemans, "shop_order", all)).toEqual([]);
		await as(riedel, async () => {
			expect(await mayChange({ type: "shop_order", id: mine[0] })).toBe(false);
		});
	});

	test("limited to some sites, still reads their customer's shop orders", async () => {
		const contact = await contactOf(riedel);
		const [{ id: site }] = await rows<{ id: number }>(
			`insert into customer_site (organization_id, customer_id, name, city, country)
			 values ('org-shltr', ?, 'Annex', 'Ede', 'NL') returning id`,
			[contact.customerId],
		);
		await rows(`update portal_contact set all_sites = 0 where id = ?`, [contact.id]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values ('org-shltr', ?, ?, ?)`,
			[contact.id, contact.customerId, site],
		);
		const mine = await idsOf("shop_order", "org-shltr", "and customer_id = ?", [
			contact.customerId,
		]);
		expect(await readOneByOne(riedel, "shop_order", mine)).toEqual(mine);
	});
});
