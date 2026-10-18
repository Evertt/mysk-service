/**
 * Maintenance plans' pages: a unit's card and its dialogs, the due list (its range select, search,
 * phone layout and bulk action), the dashboard's card, the equipment list's column, and a
 * contract's card. What the server decides (the plans stored and logged, the ranges, the orders
 * made and the plans moved on, the counts, the column's sorting and filters) is
 * `../unit/server/plans.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, organizations, rows, useApp } from "#e2e/app.ts";

import {
	activeDueBefore,
	dayKey,
	daysFromToday,
	pageLocators,
	today,
	unitWithoutPlan,
} from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const { card, dialog, planMenu } = pageLocators(app);

/** The unit this file gives a plan. */
let unit: { id: number; serial_number: string; customer_id: number };

describe("a unit's maintenance plans, in North", () => {
	test("a plan is added on the unit's page, badged as overdue", async () => {
		unit = await unitWithoutPlan(north.id);
		await app.go(`/equipment/${unit.serial_number}`);
		await card().getByText("No maintenance plans").waitFor();
		await card().getByRole("button", { name: "Add plan" }).click();
		const form = dialog();
		await form.getByLabel("Description").fill("Quarterly filter check");
		await form.getByLabel("Order type").selectOption("inspection");
		await form.getByLabel("Interval in months").fill("3");
		// Long overdue, so it heads the due list.
		await form.getByLabel("Next due on").fill(dayKey(daysFromToday(-400)));
		await app.submit(form.getByRole("button", { name: "Save plan" }));
		await app.toast("Plan saved");
		await card().getByText("Quarterly filter check").waitFor();
		expect(await card().locator("[data-overdue]").count()).toBe(1);
	});

	test("it's edited, paused and resumed", async () => {
		await planMenu("Quarterly filter check");
		await app.page.getByRole("menuitem", { name: "Edit" }).click();
		await dialog().getByLabel("Description").fill("Quarterly filter change");
		await app.submit(dialog().getByRole("button", { name: "Save plan" }));
		await card().getByText("Quarterly filter change").waitFor();

		await planMenu("Quarterly filter change");
		await app.page.getByRole("menuitem", { name: "Pause" }).click();
		await card().getByText("Paused").waitFor();
		// A paused plan isn't badged as overdue.
		expect(await card().locator("[data-overdue]").count()).toBe(0);

		await planMenu("Quarterly filter change");
		await app.page.getByRole("menuitem", { name: "Resume" }).click();
		await expect.poll(() => card().locator("[data-overdue]").count()).toBe(1);
	});
});

describe("the due list, in North", () => {
	test("shows the overdue plans on request, and finds a plan by its unit", async () => {
		await app.go("/maintenance");
		await app.page.getByRole("combobox", { name: "Due" }).selectOption("overdue");
		await app.page.waitForURL((url) => url.searchParams.get("due") === "overdue");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(await activeDueBefore(north.id, today));

		await app.go(`/maintenance?q=${unit.serial_number}`);
		const row = app.page.locator('[data-slot="data-table"] tbody tr').first();
		await row.getByText("Quarterly filter change").waitFor();
		expect(await row.innerText()).toContain("Every 3 months");
		expect(await row.locator("[data-overdue]").count()).toBe(1);
	});

	test("fits a phone's screen, the toolbar's actions wrapping", async () => {
		await onPhone(app.page, async () => {
			await app.go("/maintenance");
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});

	test("creates an order for each selected plan", async () => {
		const { page } = app;
		await app.go("/maintenance?due=overdue");
		const shown = page.locator('[data-slot="data-table"] tbody tr');
		await shown.nth(0).getByRole("checkbox", { name: "Select row" }).click();
		await shown.nth(1).getByRole("checkbox", { name: "Select row" }).click();
		await page
			.getByRole("region", { name: "Actions on the selected rows" })
			.getByRole("button", { name: "Create orders" })
			.click();
		const confirm = page.getByRole("alertdialog");
		await confirm.getByText("Create orders for 2 plans?").waitFor();
		await confirm.getByRole("button", { name: "Create orders" }).click();
		await app.toast("2 created");
		// Ours, due 400 days ago, is still overdue after one quarter, now with its order.
		await app.go(`/maintenance?q=${unit.serial_number}`);
		const row = page.locator('[data-slot="data-table"] tbody tr').first();
		await row.getByRole("link", { name: /^ORD-/ }).waitFor();
		expect(await row.locator("[data-overdue]").count()).toBe(1);
	});
});

describe("the dashboard and the equipment list, in North", () => {
	test("the dashboard's card links to the overdue plans", async () => {
		await app.go("/");
		const overview = app.page.locator("[data-maintenance-overview]");
		await overview.waitFor();
		expect(await overview.innerText()).toMatch(/Overdue\s+\d+[\s\S]*Due within 30 days\s+\d+/);
		await overview.locator('[data-range="overdue"]').click();
		await app.page.waitForURL((url) => url.pathname === "/maintenance");
		expect(new URL(app.page.url()).searchParams.get("due")).toBe("overdue");
	});

	test("the equipment list sorts by the next maintenance", async () => {
		await app.go("/equipment");
		await app.sortBy("Next maintenance", "ascending");
		expect(app.page.url()).toContain("sort=next-maintenance");
		const firstRow = app.page.locator('[data-slot="data-table"] tbody tr').first();
		expect(await firstRow.locator("[data-overdue]").count()).toBe(1);
	});
});

describe("a contract's page, in North", () => {
	test("lists its covered units' plans, and adds one to each covered unit without one", async () => {
		const { page } = app;
		const [contract] = await rows<{ number: string; without: number }>(
			`select c.number, (select count(*) from contract_equipment ce where ce.contract_id = c.id
			   and not exists (select 1 from maintenance_plan p where p.equipment_id = ce.equipment_id))
			 as without from contract c where c.organization_id = ?
			 and exists (select 1 from contract_equipment ce where ce.contract_id = c.id
			   and not exists (select 1 from maintenance_plan p where p.equipment_id = ce.equipment_id))
			 order by c.id limit 1`,
			[north.id],
		);

		await app.go(`/contracts/${contract.number}`);
		const contractCard = page.locator("[data-maintenance-contract]");
		await contractCard.waitFor();
		await contractCard
			.getByRole("button", { name: "Add a plan to each covered unit without one" })
			.click();
		const form = dialog();
		await form.getByLabel("Description").fill("Jaarlijkse servicebeurt");
		await form.getByLabel("Interval in months").fill("12");
		await app.submit(form.getByRole("button", { name: "Add plan" }));
		await app.toast(`${contract.without} plan${contract.without === 1 ? "" : "s"} added`);
		await contractCard.getByText("Every covered unit has a plan.").waitFor();
		expect(await contractCard.getByText("Jaarlijkse servicebeurt").count()).toBeGreaterThanOrEqual(
			contract.without,
		);
	});
});
