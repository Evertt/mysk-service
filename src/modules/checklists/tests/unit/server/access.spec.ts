/**
 * Who may read and change the checklists module's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads templates, their points and every order's checklists;
 * an engineer the checklists of their own orders; a customer's contact the completed ones of their
 * customer's orders; and none of it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import {
	as,
	demoAccount,
	north,
	shltr,
	value,
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
		await as(shltr.engineer, () => null);
		const me = await value<number>(
			`select e.id from engineer e join "user" u on u.id = e.user_id where u.email = ?`,
			[shltr.engineer.email],
		);
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
		await as(riedel, () => null);
		const customer = await value<number>(
			`select c.customer_id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
			[riedel.email],
		);
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
});

describe("another tenant's office", () => {
	test("does not read them either", async () => {
		const ids = (await idsOf("checklist", "org-shltr")).slice(0, 5);
		expect(await readOneByOne(north.owner, "checklist", ids)).toEqual([]);
	});
});
