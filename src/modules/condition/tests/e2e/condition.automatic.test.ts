/**
 * The condition settings and the daily job in North: the thresholds (critical below attention),
 * and "Plan critical units automatically", off at first; on, the daily run makes a maintenance
 * order for each critical unit in care without an open order, once.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, runDailyJobs, useApp } from "#e2e/app.ts";

import { pageLocators, unitStates } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog } = pageLocators(app);

const autoPlan = () =>
	app.page.getByRole("checkbox", { name: "Plan critical units automatically" });
const save = () => app.page.getByRole("button", { name: "Save settings" });

/** The tenant's critical units in care without an open order: what the run plans. */
async function toPlan(organizationId: string) {
	const open = new Set(
		(
			await rows<{ equipment_id: number }>(
				`select distinct ou.equipment_id from order_unit ou join "order" o on o.id = ou.order_id
				 where o.organization_id = ? and o.status in ('quote', 'scheduled', 'in_progress')`,
				[organizationId],
			)
		).map((row) => row.equipment_id),
	);
	return (await unitStates(organizationId)).filter(
		(unit) => unit.concern === "critical" && !open.has(unit.id),
	);
}

describe("the settings", () => {
	test("are off at first: the run plans nothing", async () => {
		const { status, reports } = await runDailyJobs();
		expect(status).toBe(200);
		expect(reports[north.id]?.["condition.orders"]).toBeUndefined();
	});

	test("refuse critical at or above attention", async () => {
		const { page } = app;
		await app.go("/condition");
		await page.getByRole("link", { name: "Settings" }).click();
		await page.waitForURL((url) => url.pathname === "/condition/settings");
		expect(await autoPlan().isChecked()).toBe(false);
		expect(await page.getByLabel("Critical below (%)").inputValue()).toBe("40");
		expect(await page.getByLabel("Attention below (%)").inputValue()).toBe("70");
		await page.getByLabel("Critical below (%)").fill("80");
		await app.submit(save());
		expect(await app.issues()).toContain("Critical must be below attention.");
		expect(
			await rows(`select critical_below from condition_settings where organization_id = ?`, [
				north.id,
			]),
		).toEqual([{ critical_below: 40 }]);
	});

	test("a manager turns automatic planning on", async () => {
		const { page } = app;
		await page.getByLabel("Critical below (%)").fill("40");
		await autoPlan().click();
		await app.submit(save());
		await page.waitForURL((url) => url.pathname === "/condition");
		expect(
			await rows(
				`select critical_below, attention_below, auto_plan from condition_settings
				 where organization_id = ?`,
				[north.id],
			),
		).toEqual([{ critical_below: 40, attention_below: 70, auto_plan: 1 }]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity where organization_id = ?
			 and subject_type = 'condition_settings' order by id desc limit 1`,
			[north.id],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({ autoPlan: [false, true] });
	});
});

describe("the daily run", () => {
	test("plans each critical unit without an open order, once", async () => {
		// A unit made critical through its card, so there's at least one.
		const [unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and e.status = 'operational'
			 and not exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
				where ou.equipment_id = e.id and o.status in ('quote', 'scheduled', 'in_progress'))
			 order by e.id desc limit 1`,
			[north.id],
		);
		await app.go(`/equipment/${unit.serial_number}`);
		await card().getByRole("button", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("15");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");

		const planned = await toPlan(north.id);
		expect(planned.map((each) => each.id)).toContain(unit.id);
		const southBefore = await rows(`select id from "order" where organization_id = ?`, [south.id]);

		const first = await runDailyJobs();
		expect(first.reports[north.id]["condition.orders"]).toBe(planned.length);
		const made = await rows<{
			type: string;
			status: string;
			priority: string;
			description: string;
			equipment_id: number;
		}>(
			`select o.type, o.status, o.priority, o.description, ou.equipment_id from "order" o
			 join order_unit ou on ou.order_id = o.id
			 where o.organization_id = ? and o.type = 'maintenance' and o.priority = 'high'
			 and o.status = 'quote' and ou.equipment_id in (select value from json_each(?))`,
			[north.id, JSON.stringify(planned.map((each) => each.id))],
		);
		expect(made.map((order) => order.equipment_id).toSorted()).toEqual(
			planned.map((each) => each.id).toSorted(),
		);
		const ours = made.find((order) => order.equipment_id === unit.id)!;
		expect(ours.description).toMatch(/15%/);
		expect(await toPlan(north.id)).toEqual([]);

		// Again: nothing more, and nothing in South, which doesn't have the module.
		const second = await runDailyJobs();
		expect(second.reports[north.id]["condition.orders"]).toBe(0);
		expect(second.reports[south.id]?.["condition.orders"]).toBeUndefined();
		expect(await rows(`select id from "order" where organization_id = ?`, [south.id])).toEqual(
			southBefore,
		);
		// The settings page says when it last ran.
		await app.go("/condition/settings");
		await app.page.getByText(/: 0 orders/).waitFor();
	});
});
