/**
 * The condition in the engineer portal, on a phone: once Lev completes a unit's checklist on one of
 * his inspection orders, the unit has the condition its points work out to (the share found OK of
 * those found OK or rejected, N/A left out), on that order, by him; its card shows it and asks only
 * for his advice, which goes onto that condition. A unit that isn't on the order, or another
 * engineer's order, is refused, also by tampered fields.
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

describe("Lev's inspection or maintenance order", () => {
	let job: { id: number; number: string };
	let unit: { id: number; serial_number: string };
	let lev: number;
	let score: number;

	test("asks for no condition while the unit's checklist is open", async () => {
		lev = await value<number>(
			`select e.id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.shltrEngineer, shltr.id],
		);
		// The latest planned one: the checklists' own tests take the first.
		[job] = await rows<{ id: number; number: string }>(
			`select o.id, o.number from "order" o where o.engineer_id = ? and o.status = 'scheduled'
			 and o.type in ('inspection', 'maintenance') and exists (select 1 from checklist c where c.order_id = o.id)
			 order by o.scheduled_for desc limit 1`,
			[lev],
		);
		expect(job, "Lev has a planned inspection or maintenance with checklists").toBeDefined();
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

	test("completing the checklist records the score its points work out to", async () => {
		const points = await rows<{ text: string }>(
			`select text from checklist_result r join checklist c on c.id = r.checklist_id
			 where c.order_id = ? and c.equipment_id = ? order by r.position`,
			[job.id, unit.id],
		);
		expect(points.length, "the checklist has at least three points").toBeGreaterThanOrEqual(3);
		const point = (text: string) =>
			card(unit.serial_number).locator(`[data-point="${text.replaceAll('"', '\\"')}"]`);
		// The first rejected, the second not applicable, the rest OK.
		const [rejected, skipped, ...passed] = points;
		await point(rejected.text).getByRole("button", { name: "Reject" }).click();
		const remark = point(rejected.text).getByRole("textbox");
		await remark.fill("Draadbreuk zichtbaar bij trommel — kabelset meenemen.");
		await remark.blur();
		await point(skipped.text).getByRole("button", { name: "N/A" }).click();
		for (const each of passed) await point(each.text).getByRole("button", { name: "OK" }).click();
		const before = await conditionCount();
		await card(unit.serial_number).getByRole("button", { name: "Complete checklist" }).click();
		await asked(unit.serial_number)
			.getByText("The checklist is completed. Any advice on the unit?")
			.waitFor();
		score = Math.round((100 * passed.length) / (passed.length + 1));
		const [recorded] = await conditionsOf(unit.id);
		expect(recorded).toMatchObject({
			organization_id: shltr.id,
			score,
			advice: null,
			source: "checklist",
			order_id: job.id,
			engineer_id: lev,
		});
		expect(await conditionCount()).toBe(before + 1);
		// Shown, not asked for.
		expect(await asked(unit.serial_number).locator(`[data-condition="${score}"]`).count()).toBe(1);
		expect(await asked(unit.serial_number).getByLabel("Condition (%)").count()).toBe(0);
	});

	test("his advice goes onto that condition", async () => {
		await asked(unit.serial_number)
			.getByLabel("Advice")
			.fill("Kabelset vervangen (SD-002) — draadbreuk bij de trommel.");
		const before = await conditionCount();
		await asked(unit.serial_number).getByRole("button", { name: "Save advice" }).click();
		await app.toast("Advice saved");
		const [recorded] = await conditionsOf(unit.id);
		expect(recorded).toMatchObject({
			score,
			advice: "Kabelset vervangen (SD-002) — draadbreuk bij de trommel.",
			source: "checklist",
			order_id: job.id,
		});
		expect(await conditionCount()).toBe(before);
		await app.go(`/my/${job.number}`);
		expect(await asked(unit.serial_number).getByLabel("Advice").inputValue()).toBe(
			"Kabelset vervangen (SD-002) — draadbreuk bij de trommel.",
		);
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
		const advised = (await conditionsOf(unit.id))[0].advice;
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
			await asked(unit.serial_number).getByLabel("Advice").fill("Gemanipuleerd.");
			for (const [name, to] of fields) await tamper(unit.serial_number, name, to);
			const result = await app.expectingErrors(() =>
				app.submit(asked(unit.serial_number).getByRole("button", { name: "Save advice" })),
			);
			expect(result, JSON.stringify(fields)).toMatch(/"status":404/);
			await app.go(`/my/${job.number}`);
		}
		expect(await conditionCount()).toBe(before);
		expect((await conditionsOf(unit.id))[0].advice).toBe(advised);
	});
});
