/**
 * Who may read and change the condition module's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads a unit's conditions and components with the unit; a
 * customer's contact those of their customer's units; an engineer only those of a unit on one of
 * their own orders; and none of it exists for a tenant without the module.
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

const types = [
	["unitCondition", "unit_condition"],
	["component", "component"],
] as const;

describe("the office", () => {
	for (const [type, table] of types) {
		test(`reads its tenant's ${type} records, and not another's`, async () => {
			const own = (await idsOf(table, "org-shltr")).slice(0, 12);
			expect(own.length).toBeGreaterThan(0);
			expect(await readOneByOne(shltr.member, type, own)).toEqual(own);
			const others = (await idsOf(table, "org-north")).slice(0, 12);
			expect(await readOneByOne(shltr.member, type, others)).toEqual([]);
			expect(await readOneByOne(north.owner, type, own)).toEqual([]);
		});
	}

	test("reads the settings, and only managers change them", async () => {
		await as(shltr.member, async () => {
			expect(await mayRead({ type: "condition_settings", id: "condition" })).toBe(true);
			expect(await mayChange({ type: "condition_settings", id: "condition" })).toBe(false);
		});
		await as(shltr.owner, async () => {
			expect(await mayChange({ type: "condition_settings", id: "condition" })).toBe(true);
		});
	});

	test("finds none of them in a tenant without the module", async () => {
		const [condition] = await idsOf("unit_condition", "org-shltr");
		await withoutModule("shltr", "condition", async () => {
			await as(shltr.owner, async () => {
				expect(await mayRead({ type: "unitCondition", id: condition })).toBe(false);
				expect(await mayRead({ type: "condition_settings", id: "condition" })).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			expect(await mayRead({ type: "unitCondition", id: condition })).toBe(true);
		});
	});
});

describe("a field engineer", () => {
	test("reads the conditions and components of units on their own orders only", async () => {
		await as(shltr.engineer, () => null);
		const me = await value<number>(
			`select e.id from engineer e join "user" u on u.id = e.user_id where u.email = ?`,
			[shltr.engineer.email],
		);
		const theirUnits = `(select equipment_id from order_unit where order_id in
			(select id from "order" where engineer_id = ?))`;
		for (const [type, table] of types) {
			const all = await idsOf(table, "org-shltr");
			const mine = await idsOf(table, "org-shltr", `and equipment_id in ${theirUnits}`, [me]);
			expect(mine.length, type).toBeGreaterThan(0);
			expect(mine.length, type).toBeLessThan(all.length);
			expect(await readOneByOne(shltr.engineer, type, all), type).toEqual(mine);
		}
		await as(shltr.engineer, async () => {
			expect(await mayRead({ type: "condition_settings", id: "condition" })).toBe(false);
			const [condition] = await idsOf("unit_condition", "org-shltr");
			expect(await mayChange({ type: "unitCondition", id: condition })).toBe(false);
		});
	});
});

describe("a customer's contact", () => {
	test("reads the conditions and components of their customer's units, no one else's", async () => {
		await as(riedel, () => null);
		const customer = await value<number>(
			`select c.customer_id from portal_contact c join "user" u on u.id = c.user_id where u.email = ?`,
			[riedel.email],
		);
		for (const [type, table] of types) {
			const all = await idsOf(table, "org-shltr");
			const theirs = await idsOf(
				table,
				"org-shltr",
				`and equipment_id in (select id from equipment where customer_id = ?)`,
				[customer],
			);
			expect(theirs.length, type).toBeGreaterThan(0);
			expect(theirs.length, type).toBeLessThan(all.length);
			expect(await readOneByOne(riedel, type, all), type).toEqual(theirs);
		}
		await as(riedel, async () => {
			expect(await mayRead({ type: "condition_settings", id: "condition" })).toBe(false);
		});
	});
});
