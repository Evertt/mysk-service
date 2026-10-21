/**
 * Who may read and change the checklists module's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads templates, their points and every order's checklists;
 * an engineer the checklists of their own orders; a customer's contact the completed ones of their
 * customer's orders; and none of it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import {
	contactOf,
	customerIdOf,
	engineerIdOf,
	idsOf,
	readOneByOne,
} from "#unit/lib/server/access/support.ts";
import {
	as,
	demoAccount,
	north,
	rows,
	shltr,
	withoutModule,
} from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");

describe("the office", () => {
	test("reads the templates, their points and the checklists of its tenant", async () => {
		for (const [type, table] of [
			["checklistTemplate", "checklist_template"],
			["checklistTemplateItem", "checklist_template_item"],
			["checklist", "checklist"],
		]) {
			const own = (await idsOf(table, "org-shltr")).slice(0, 10);
			expect(own.length, type).toBeGreaterThan(0);
			expect(await readOneByOne(shltr.member, type, own), type).toEqual(own);
			const others = (await idsOf(table, "org-north")).slice(0, 10);
			expect(await readOneByOne(shltr.member, type, others), type).toEqual([]);
		}
	});

	test("lets only managers change a template and its points", async () => {
		const [template] = await idsOf("checklist_template", "org-shltr");
		const [point] = await idsOf("checklist_template_item", "org-shltr");
		await as(shltr.member, async () => {
			expect(await mayChange({ type: "checklistTemplate", id: template })).toBe(false);
			expect(await mayChange({ type: "checklistTemplateItem", id: point })).toBe(false);
		});
		await as(shltr.owner, async () => {
			expect(await mayChange({ type: "checklistTemplate", id: template })).toBe(true);
			expect(await mayChange({ type: "checklistTemplateItem", id: point })).toBe(true);
		});
	});

	test("finds none of them in a tenant without the module", async () => {
		const [checklist] = await idsOf("checklist", "org-shltr");
		const [template] = await idsOf("checklist_template", "org-shltr");
		await withoutModule("shltr", "checklists", async () => {
			await as(shltr.owner, async () => {
				expect(await mayRead({ type: "checklist", id: checklist })).toBe(false);
				expect(await mayRead({ type: "checklistTemplate", id: template })).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			expect(await mayRead({ type: "checklist", id: checklist })).toBe(true);
		});
	});
});

describe("a field engineer", () => {
	test("reads the checklists of their own orders, not another engineer's, and no templates", async () => {
		const me = await engineerIdOf(shltr.engineer);
		const all = await idsOf("checklist", "org-shltr");
		const mine = await idsOf(
			"checklist",
			"org-shltr",
			`and order_id in (select id from "order" where engineer_id = ?)`,
			[me],
		);
		expect(mine.length).toBeGreaterThan(0);
		expect(mine.length).toBeLessThan(all.length);
		expect(await readOneByOne(shltr.engineer, "checklist", all)).toEqual(mine);
		const templates = await idsOf("checklist_template", "org-shltr");
		expect(await readOneByOne(shltr.engineer, "checklistTemplate", templates)).toEqual([]);
		const [first] = mine;
		await as(shltr.engineer, async () => {
			expect(await mayChange({ type: "checklist", id: first })).toBe(true);
		});
	});
});

describe("a customer's contact", () => {
	test("reads the completed checklists of their customer's orders, no drafts, no one else's", async () => {
		const customer = await customerIdOf(riedel);
		const all = await idsOf("checklist", "org-shltr");
		const completed = await idsOf(
			"checklist",
			"org-shltr",
			`and status = 'completed' and order_id in (select id from "order" where customer_id = ?)`,
			[customer],
		);
		const drafts = await idsOf(
			"checklist",
			"org-shltr",
			`and status != 'completed' and order_id in (select id from "order" where customer_id = ?)`,
			[customer],
		);
		expect(completed.length).toBeGreaterThan(0);
		expect(drafts.length).toBeGreaterThan(0);
		expect(completed.length).toBeLessThan(all.length - drafts.length);
		expect(await readOneByOne(riedel, "checklist", all)).toEqual(completed);
		await as(riedel, async () => {
			expect(await mayChange({ type: "checklist", id: completed[0] })).toBe(false);
		});
	});

	test("limited to some sites, reads only the checklists of units at those sites", async () => {
		const contact = await contactOf(riedel);
		const mine = String(contact.customerId);
		// A completed checklist of one of their orders, and the site of its unit.
		const [first] = await rows<{ id: number; order_id: number; site_id: number }>(
			`select c.id, c.order_id, e.site_id from checklist c join equipment e on e.id = c.equipment_id
			 where c.organization_id = 'org-shltr' and c.status = 'completed'
			   and c.order_id in (select id from "order" where customer_id = ?) order by c.id limit 1`,
			[mine],
		);
		// The same order gets a second completed checklist, for a unit at another site.
		const [annex] = await rows<{ id: number }>(
			`insert into customer_site (organization_id, customer_id, name, city, country)
			 values ('org-shltr', ?, 'Annex', 'Ede', 'NL') returning id`,
			[mine],
		);
		const [other] = await rows<{ id: number }>(
			`select id from equipment where organization_id = 'org-shltr' and customer_id = ?
			   and id not in (select equipment_id from order_unit where order_id = ?) order by id limit 1`,
			[mine, first.order_id],
		);
		await rows(`update equipment set site_id = ?, location_id = null where id = ?`, [
			annex.id,
			other.id,
		]);
		await rows(
			`insert into order_unit (organization_id, order_id, customer_id, equipment_id, position)
			 values ('org-shltr', ?, ?, ?, (select max(position) + 1 from order_unit where order_id = ?))`,
			[first.order_id, mine, other.id, first.order_id],
		);
		await rows(
			`insert into checklist (organization_id, order_id, equipment_id, template_id, name, norm,
			                        validity_months, kind, status, completed_at)
			 select organization_id, order_id, ?, template_id, name, norm, validity_months, kind,
			        'completed', completed_at from checklist where id = ?`,
			[other.id, first.id],
		);
		const [added] = await idsOf("checklist", "org-shltr", "and order_id = ? and equipment_id = ?", [
			first.order_id,
			other.id,
		]);
		expect(added).toBeDefined();
		await rows(`update portal_contact set all_sites = 0 where id = ?`, [contact.id]);
		await rows(
			`insert into portal_contact_site (organization_id, contact_id, customer_id, site_id)
			 values ('org-shltr', ?, ?, ?)`,
			[contact.id, mine, first.site_id],
		);
		const all = await idsOf("checklist", "org-shltr");
		const expected = await idsOf(
			"checklist",
			"org-shltr",
			`and status = 'completed'
			 and equipment_id in (select id from equipment where site_id = ?)
			 and order_id in (select id from "order" where customer_id = ?)`,
			[first.site_id, mine],
		);
		expect(expected).toContain(String(first.id));
		expect(expected).not.toContain(added);
		expect(await readOneByOne(riedel, "checklist", all)).toEqual(expected);
	});
});

describe("another tenant's office", () => {
	test("does not read them either", async () => {
		const ids = (await idsOf("checklist", "org-shltr")).slice(0, 5);
		expect(await readOneByOne(north.owner, "checklist", ids)).toEqual([]);
	});
});
