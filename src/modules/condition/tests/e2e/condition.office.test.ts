/**
 * The condition in North's office: the equipment list's condition and status columns, sorted and
 * filtered in the database; a unit's card, where a member records its condition (logged, and its
 * status following); and the parts used on a unit, from its orders' materials.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users, value } from "#e2e/app.ts";

import { conditionsOf, pageLocators, thresholdsOf, unitStates } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, dialog } = pageLocators(app);

describe("the equipment list", () => {
	test("has the condition and its status, filtered by status in the database", async () => {
		const { page } = app;
		const units = await unitStates(north.id, true);
		const critical = units.filter((unit) => unit.status === "critical");
		expect(critical.length).toBeGreaterThan(0);
		await app.go("/equipment?condition-status=critical");
		await app.tableSettled();
		expect(await page.locator("thead").getByText("Condition status").count()).toBe(1);
		expect(await app.rowCount()).toBe(critical.length);
		const shown = await page
			.locator('[data-slot="data-table"] tbody tr [data-status]')
			.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => cell.dataset.status));
		expect(new Set(shown)).toEqual(new Set(["critical"]));
	});

	test("sorts by condition, the lowest first, the units without one last", async () => {
		const { page } = app;
		const units = await unitStates(north.id, true);
		await app.go("/equipment?sort=condition");
		await app.tableSettled();
		const scores = await page
			.locator('[data-slot="data-table"] tbody tr [data-condition]')
			.evaluateAll((cells: HTMLElement[]) => cells.map((cell) => Number(cell.dataset.condition)));
		const recorded = units.flatMap((unit) => unit.score ?? []).toSorted((a, b) => a - b);
		expect(scores).toEqual(recorded.slice(0, scores.length));
	});

	test("filters by the condition's band", async () => {
		const { attention } = await thresholdsOf(north.id);
		const units = await unitStates(north.id, true);
		await app.go("/equipment?condition=low,fair");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(
			units.filter((unit) => unit.score !== null && unit.score < attention).length,
		);
	});
});

describe("a unit's card", () => {
	let unit: { id: number; serial_number: string };

	test("says there's no condition yet", async () => {
		[unit] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e where e.organization_id = ?
			 and e.status = 'operational'
			 and not exists (select 1 from checklist k where k.equipment_id = e.id)
			 and not exists (select 1 from unit_condition u where u.equipment_id = e.id)
			 and not exists (select 1 from order_unit ou join "order" o on o.id = ou.order_id
				where ou.equipment_id = e.id and o.status in ('scheduled', 'in_progress'))
			 order by e.id limit 1`,
			[north.id],
		);
		expect(unit, "North has a unit without a condition").toBeDefined();
		await app.go(`/equipment/${unit.serial_number}`);
		await card().getByText("No condition recorded yet.").waitFor();
	});

	test("refuses a score over 100", async () => {
		await card().getByRole("button", { name: "Record condition" }).click();
		const score = dialog().getByLabel("Condition (%)");
		// The browser holds the input to 0–100 itself; the server, too.
		expect(await score.getAttribute("max")).toBe("100");
		await score.evaluate((input) => input.removeAttribute("max"));
		await score.fill("120");
		await app.submit(dialog().getByRole("button", { name: "Save condition" }));
		expect(await app.issues()).toContain("A score from 0 to 100.");
		expect(await conditionsOf(unit.id)).toEqual([]);
	});

	test("records a condition, which makes the unit critical, and logs it", async () => {
		await dialog().getByLabel("Condition (%)").fill("30");
		await dialog().getByLabel("Advice").fill("Veerpakket vervangen (SD-001).");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		const admin = await value<string>(`select id from user where email = ?`, [users.admin]);
		expect(await conditionsOf(unit.id)).toEqual([
			expect.objectContaining({
				organization_id: north.id,
				score: 30,
				advice: "Veerpakket vervangen (SD-001).",
				source: "office",
				order_id: null,
				engineer_id: null,
				user_id: admin,
			}),
		]);
		await card().locator('[data-condition="30"]').first().waitFor();
		expect(await card().locator("[data-status]").getAttribute("data-status")).toBe("critical");
		expect(await card().innerText()).toContain("Veerpakket vervangen (SD-001).");
		const [entry] = await rows<{
			action: string;
			subject_label: string;
			parent_id: string;
			note: string;
		}>(
			`select action, subject_label, parent_id, note from activity where organization_id = ?
			 and subject_type = 'unitCondition' order by id desc limit 1`,
			[north.id],
		);
		expect(entry).toEqual({
			action: "recorded",
			subject_label: `${unit.serial_number} · 30%`,
			parent_id: String(unit.id),
			note: "Veerpakket vervangen (SD-001).",
		});
	});

	test("a newer condition takes its place, the older one stays in its history", async () => {
		await card().getByRole("button", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("85");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		await expect.poll(() => card().locator("[data-condition-entry]").count()).toBe(2);
		expect(await card().locator("[data-status]").getAttribute("data-status")).toBe("ok");
		expect((await conditionsOf(unit.id)).map((condition) => condition.score)).toEqual([85, 30]);
	});
});

test("a unit's page shows the parts used on its completed orders", async () => {
	const [used] = await rows<{ serial_number: string; name: string }>(
		`select e.serial_number, m.name from order_line l join "order" o on o.id = l.order_id
		 join order_unit ou on ou.order_id = o.id join equipment e on e.id = ou.equipment_id
		 join material m on m.id = l.material_id
		 where o.organization_id = ? and o.status in ('completed', 'invoiced')
		 order by o.completed_at desc limit 1`,
		[north.id],
	);
	expect(used, "North used materials on a completed order").toBeDefined();
	await app.go(`/equipment/${used.serial_number}`);
	const parts = app.page.locator("[data-parts-used]");
	await parts.getByText("Parts used").waitFor();
	await parts.getByRole("link", { name: used.name }).first().waitFor();
});
