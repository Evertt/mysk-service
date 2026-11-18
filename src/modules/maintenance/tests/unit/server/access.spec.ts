/**
 * Who may read and change the maintenance module's records (`server/access.ts`), on the seeded
 * database as SHLTR's people: the office reads the plans of its tenant and the settings (a manager
 * changes those, any member the plans); a customer's contact reads the plans of their own units (the
 * site report), an engineer none; and none of it exists for a tenant without the module.
 */
import { describe, expect, test } from "vite-plus/test";

import { mayChange, mayRead } from "#lib/server/access/index.ts";
import { idsOf, readOneByOne } from "#unit/lib/server/access/support.ts";
import { as, demoAccount, north, shltr, withoutModule } from "#unit/lib/server/harness/index.ts";

const riedel = demoAccount("facilitair@riedel.example");
const settings = { type: "maintenance_settings", id: "tenant" };

describe("the plans", () => {
	test("are read by the office of their tenant, not another's", async () => {
		const own = (await idsOf("maintenance_plan", "org-shltr")).slice(0, 15);
		const others = (await idsOf("maintenance_plan", "org-north")).slice(0, 15);
		expect(own.length).toBeGreaterThan(0);
		expect(others.length).toBeGreaterThan(0);
		expect(await readOneByOne(shltr.member, "maintenancePlan", own)).toEqual(own);
		expect(await readOneByOne(shltr.member, "maintenancePlan", others)).toEqual([]);
		expect(await readOneByOne(north.owner, "maintenancePlan", own)).toEqual([]);
		expect(await readOneByOne(north.owner, "maintenancePlan", others)).toEqual(others);
	});

	test("are changed by any member of the office", async () => {
		const [plan] = await idsOf("maintenance_plan", "org-shltr");
		await as(shltr.member, async () => {
			expect(await mayChange({ type: "maintenancePlan", id: plan })).toBe(true);
		});
	});

	test("are not read by an engineer", async () => {
		const own = (await idsOf("maintenance_plan", "org-shltr")).slice(0, 15);
		expect(await readOneByOne(shltr.engineer, "maintenancePlan", own)).toEqual([]);
	});

	test("are read by a customer's contact for their own units only, and never changed", async () => {
		const unitsOf = `and equipment_id in (select id from equipment where customer_id = (select id from customer where name = 'Riedel B.V.' and organization_id = 'org-shltr'))`;
		const theirs = await idsOf("maintenance_plan", "org-shltr", unitsOf);
		const others = (
			await idsOf(
				"maintenance_plan",
				"org-shltr",
				unitsOf.replace("equipment_id in", "equipment_id not in"),
			)
		).slice(0, 15);
		expect(theirs.length).toBeGreaterThan(0);
		expect(await readOneByOne(riedel, "maintenancePlan", theirs)).toEqual(theirs);
		expect(await readOneByOne(riedel, "maintenancePlan", others)).toEqual([]);
		await as(riedel, async () => {
			expect(await mayChange({ type: "maintenancePlan", id: theirs[0] })).toBe(false);
		});
	});
});

describe("the settings", () => {
	test("are read by the office and changed by managers only", async () => {
		await as(shltr.member, async () => {
			expect(await mayRead(settings)).toBe(true);
			expect(await mayChange(settings)).toBe(false);
		});
		await as(shltr.owner, async () => {
			expect(await mayChange(settings)).toBe(true);
		});
	});

	test("are not read by an engineer or a customer's contact", async () => {
		for (const actor of [shltr.engineer, riedel]) {
			await as(actor, async () => {
				expect(await mayRead(settings)).toBe(false);
			});
		}
	});
});

describe("a tenant without the module", () => {
	test("finds neither", async () => {
		const [plan] = await idsOf("maintenance_plan", "org-shltr");
		await withoutModule("shltr", "maintenance", async () => {
			await as(shltr.owner, async () => {
				expect(await mayRead({ type: "maintenancePlan", id: plan })).toBe(false);
				expect(await mayRead(settings)).toBe(false);
			});
		});
		await as(shltr.owner, async () => {
			expect(await mayRead({ type: "maintenancePlan", id: plan })).toBe(true);
		});
	});
});
