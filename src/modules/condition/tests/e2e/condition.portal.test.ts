/**
 * The condition in the engineer portal, on a phone: once Lev completes a unit's checklist on one of
 * his inspection orders, its card asks how the unit is doing, and what he records is on that order,
 * by him. A unit that isn't on the order, or another engineer's order, is refused, also by
 * tampered fields.
 */
import { describe, expect, test } from "vite-plus/test";

import { mobileViewport, organizations, rows, useApp, users, value } from "#e2e/app.ts";

import { conditionCount, conditionsOf } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrEngineer, viewport: mobileViewport });
const page = () => app.page;

/** A unit's checklist card in the portal, by its serial number. */
const card = (serial: string) => page().locator(`[data-field-checklist="${serial}"]`);
const asked = (serial: string) => card(serial).locator("[data-field-condition]");

/** Sets a hidden input of the condition's form, whose name starts with `name`. */
const tamper = (serial: string, name: string, to: string) =>
	asked(serial)
		.locator(`input[type="hidden"][name^="${name}"]`)
		.first()
		.evaluate((input: HTMLInputElement, v) => (input.value = v), to);

describe("Lev's inspection order", () => {
	let job: { id: number; number: string };
	let unit: { id: number; serial_number: string };
	let lev: number;

	test("asks for no condition while the unit's checklist is open", async () => {
		lev = await value<number>(
			`select e.id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.shltrEngineer, shltr.id],
		);
		// The latest planned one: the checklists' own tests take the first.
		[job] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.engineer_id = ? and o.status = 'scheduled'
			 and o.type = 'inspection' and exists (select 1 from checklist c where c.order_id = o.id)
			 order by o.scheduled_for desc limit 1`,
			[lev],
		);
		expect(job, "Lev has a planned inspection with checklists").toBeDefined();
		[unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from checklist c join equipment e on e.id = c.equipment_id
			 join order_unit u on u.order_id = c.order_id and u.equipment_id = c.equipment_id
			 where c.order_id = ? order by u.position limit 1`,
			[job.id],
		);
		await app.go(`/my/${job.number}`);
		await page().getByRole("button", { name: "Start job" }).click();
		await card(unit.serial_number).getByRole("button", { name: "Complete checklist" }).waitFor();
		expect(await asked(unit.serial_number).count()).toBe(0);
	});

	test("asks how the unit is doing once its checklist is completed", async () => {
		const oks = card(unit.serial_number).getByRole("button", { name: "OK", exact: true });
		const points = await oks.count();
		expect(points).toBeGreaterThan(0);
		for (let i = 0; i < points; i++) await oks.nth(i).click();
		await card(unit.serial_number).getByRole("button", { name: "Complete checklist" }).click();
		await asked(unit.serial_number)
			.getByText("The checklist is completed. How is the unit doing?")
			.waitFor();
	});

	test("records the condition on the order, by Lev", async () => {
		await asked(unit.serial_number).getByLabel("Condition (%)").fill("35");
		await asked(unit.serial_number)
			.getByLabel("Advice")
			.fill("Kabelset vervangen (SD-002) — draadbreuk bij de trommel.");
		await asked(unit.serial_number).getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		const [recorded] = await conditionsOf(unit.id);
		expect(recorded).toMatchObject({
			organization_id: shltr.id,
			score: 35,
			advice: "Kabelset vervangen (SD-002) — draadbreuk bij de trommel.",
			source: "checklist",
			order_id: job.id,
			engineer_id: lev,
		});
		await asked(unit.serial_number).getByText("Recorded: 35%").waitFor();
		expect(await asked(unit.serial_number).locator('[data-condition="35"]').count()).toBe(1);
	});

	test("a unit that isn't on the order, or another engineer's order, is refused", async () => {
		const [elsewhere] = await rows<{ id: number }>(
			`select e.id from equipment e where e.organization_id = ? and not exists
			 (select 1 from order_unit u where u.order_id = ? and u.equipment_id = e.id) limit 1`,
			[shltr.id, job.id],
		);
		const [others] = await rows<{ number: string; equipment_id: number }>(
			`select o.number, u.equipment_id from "order" o join order_unit u on u.order_id = o.id
			 where o.organization_id = ? and o.engineer_id <> ? limit 1`,
			[shltr.id, lev],
		);
		const [northern] = await rows<{ number: string; equipment_id: number }>(
			`select o.number, u.equipment_id from "order" o join order_unit u on u.order_id = o.id
			 where o.organization_id = ? limit 1`,
			[organizations.north.id],
		);
		const before = await conditionCount();
		const tampered: [string, string][][] = [
			[["equipmentId", String(elsewhere.id)]],
			[
				["number", others.number],
				["equipmentId", String(others.equipment_id)],
			],
			[
				["number", northern.number],
				["equipmentId", String(northern.equipment_id)],
			],
		];
		for (const fields of tampered) {
			await asked(unit.serial_number).getByLabel("Condition (%)").fill("10");
			for (const [name, to] of fields) await tamper(unit.serial_number, name, to);
			const result = await app.expectingErrors(() =>
				app.submit(asked(unit.serial_number).getByRole("button", { name: "Record again" })),
			);
			expect(result, JSON.stringify(fields)).toMatch(/"status":404/);
			await app.go(`/my/${job.number}`);
		}
		expect(await conditionCount()).toBe(before);
	});
});
