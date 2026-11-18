/**
 * The condition in the engineer portal, on a phone: a point Lev rejects on a unit's checklist asks
 * for its defect on NEN 2767's scales (severity, extent, intensity) and photos, scored as he picks;
 * once he completes the checklist, its card shows the condition it gave the unit (its worst
 * defect's), and a component's over its own points, and asks only for his advice, which is kept.
 * What's recorded (on the order, by him), the defect and its photos kept, the advice stored and
 * logged, and a point, unit or order that isn't his refused are `conditions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { mobileViewport, organizations, rows, useApp, users, value } from "#e2e/app.ts";

import { png } from "./helpers.ts";

const shltr = organizations.shltr;
const app = useApp({ user: users.shltrEngineer, viewport: mobileViewport });
const page = () => app.page;

/** A unit's checklist card in the portal, by its serial number. */
const card = (serial: string) => page().locator(`[data-field-checklist="${serial}"]`);
const asked = (serial: string) => card(serial).locator("[data-field-condition]");

describe("Lev's inspection or maintenance order", () => {
	let job: { id: number; number: string };
	let unit: { id: number; serial_number: string };
	let score: number;

	test("asks for no condition while the unit's checklist is open", async () => {
		const lev = await value<number>(
			`select e.id from engineer e join user u on u.id = e.user_id
			 where u.email = ? and e.organization_id = ?`,
			[users.shltrEngineer, shltr.id],
		);
		// The latest planned one: the checklists' own tests take the smallest inspection.
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

	test("a rejected point asks for its defect; completing the checklist shows the score it gives, and its component's", async () => {
		const points = await rows<{ text: string; template_item_id: number }>(
			`select r.text, r.template_item_id from checklist_result r join checklist c on c.id = r.checklist_id
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
		// Its defect: severe, 30–70%, final stage is 6 (Zeer slecht), with a photo.
		const defect = point(rejected.text).locator("[data-point-defect]");
		await defect.waitFor();
		await defect.locator("[data-defect-severity]").getByRole("button", { name: "Severe" }).click();
		await defect.locator("[data-defect-extent]").getByRole("button", { name: "30–70%" }).click();
		await defect
			.locator("[data-defect-intensity]")
			.getByRole("button", { name: "Final stage" })
			.click();
		await defect.locator('[data-condition="6"]').waitFor();
		await defect
			.locator('input[type="file"]:not([name])')
			.setInputFiles({ name: "kabel.png", mimeType: "image/png", buffer: png });
		await defect.locator("[data-defect-photos] img").waitFor();
		await defect.getByRole("button", { name: "Save defect" }).click();
		await app.toast("Defect saved");
		await defect.locator("[data-defect-photo]").waitFor();
		await point(skipped.text).getByRole("button", { name: "N/A" }).click();
		for (const each of passed) await point(each.text).getByRole("button", { name: "OK" }).click();

		// Meanwhile the unit got a component checked by the rejected point, the skipped one and the
		// first passed one (added as the office's dialog does: `condition.components.test.ts`).
		const [part] = await rows<{ id: number; number: string }>(
			`insert into component (organization_id, equipment_id, number, name, position)
			 values (?, ?, 'OC-9901', 'Veerset proef', 99) returning id, number`,
			[shltr.id, unit.id],
		);
		for (const each of [rejected, skipped, passed[0]]) {
			await rows(
				`insert into component_checkpoint (organization_id, component_id, template_item_id)
				 values (?, ?, ?)`,
				[shltr.id, part.id, each.template_item_id],
			);
		}

		await card(unit.serial_number).getByRole("button", { name: "Complete checklist" }).click();
		await asked(unit.serial_number)
			.getByText("The checklist is completed. Any advice on the unit?")
			.waitFor();
		score = 6;
		// Shown, not asked for: the unit's, and the component's from its own points, whose rejected
		// one is the same defect.
		expect(
			await asked(unit.serial_number)
				.locator(`[data-recorded] > [data-condition="${score}"]`)
				.count(),
		).toBe(1);
		expect(
			await asked(unit.serial_number)
				.locator(`[data-component="${part.number}"] [data-condition="6"]`)
				.count(),
		).toBe(1);
		expect(await asked(unit.serial_number).locator("[data-field-defects] li").count()).toBe(1);
		expect(await asked(unit.serial_number).getByLabel("Condition").count()).toBe(0);
	});

	test("his advice goes onto that condition, and is still there after a reload", async () => {
		await asked(unit.serial_number)
			.getByLabel("Advice")
			.fill("Kabelset vervangen (SD-002) — draadbreuk bij de trommel.");
		await asked(unit.serial_number).getByRole("button", { name: "Save advice" }).click();
		await app.toast("Advice saved");
		await app.go(`/my/${job.number}`);
		expect(await asked(unit.serial_number).getByLabel("Advice").inputValue()).toBe(
			"Kabelset vervangen (SD-002) — draadbreuk bij de trommel.",
		);
		expect(
			await asked(unit.serial_number)
				.locator(`[data-recorded] > [data-condition="${score}"]`)
				.count(),
		).toBe(1);
	});
});
