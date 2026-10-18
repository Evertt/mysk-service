/**
 * The condition in North's office: the equipment list's condition and status columns, filtered by
 * status; a unit's card, where a member records its condition (its status following, a newer one
 * in its place); and the parts used on a unit, from its orders' materials. The columns' other
 * filters and their sort, and what recording a condition stores and logs, are `connect.spec.ts`'s
 * and `conditions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp } from "#e2e/app.ts";

import { pageLocators, unitStates } from "./helpers.ts";

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
});

describe("a unit's card", () => {
	test("records a condition, which makes the unit critical, and a newer one in its place", async () => {
		const [unit] = await rows<{ id: number; serial_number: string }>(
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

		await card().getByRole("button", { name: "Record condition" }).click();
		// The browser holds the input to 0–100 (the server too: `schemas.spec.ts`).
		expect(await dialog().getByLabel("Condition (%)").getAttribute("max")).toBe("100");
		await dialog().getByLabel("Condition (%)").fill("30");
		await dialog().getByLabel("Advice").fill("Veerpakket vervangen (SD-001).");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		await card().locator('[data-condition="30"]').first().waitFor();
		expect(await card().locator("[data-status]").getAttribute("data-status")).toBe("critical");
		expect(await card().innerText()).toContain("Veerpakket vervangen (SD-001).");

		// A newer one takes its place; the older one stays in its history.
		await card().getByRole("button", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("85");
		await dialog().getByRole("button", { name: "Save condition" }).click();
		await app.toast("Condition recorded");
		await expect.poll(() => card().locator("[data-condition-entry]").count()).toBe(2);
		expect(await card().locator("[data-status]").getAttribute("data-status")).toBe("ok");
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
