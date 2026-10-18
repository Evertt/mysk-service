import { describe, expect, test } from "vite-plus/test";

// The remote functions' helpers through `app.ts`: a module may import no other `remote-functions.ts`
// than its own (`remote-functions.spec.ts`).
import { isRemote, organizations, rows, tamperWithCommand, useApp, value } from "#e2e/app.ts";

import { dayKey, daysFromToday, type Plan, pageLocators, planById, plansOf } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog, sidebarLinks, planMenu, settingsCard } = pageLocators(app);

/** A South unit, which North's forms are tampered to name. */
let southUnit: { id: number; serial_number: string };

describe("in North, which has the module", () => {
	test("a new plan for another tenant's unit is refused", async () => {
		const { page } = app;
		[southUnit] = await rows<{ id: number; serial_number: string }>(
			`select id, serial_number from equipment where organization_id = ? order by id limit 1`,
			[south.id],
		);
		const [own] = await rows<{ serial_number: string }>(
			`select serial_number from equipment where organization_id = ? order by id limit 1`,
			[north.id],
		);
		await app.go(`/equipment/${own.serial_number}`);
		await card().getByRole("button", { name: "Add plan" }).click();
		await dialog().getByLabel("Description").fill("Not ours");
		await dialog()
			.getByLabel("Next due on")
			.fill(dayKey(daysFromToday(10)));
		const result = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>(
					'[role="dialog"] input[name^="equipmentId"]',
				)!.value = String(id);
			}, southUnit.id);
			return app.submit(dialog().getByRole("button", { name: "Save plan" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await plansOf(southUnit.id)).toEqual([]);
		await page.keyboard.press("Escape");
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry, and its page is a 404", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Maintenance plans");
		const response = await app.go("/maintenance?due=overdue");
		expect(response?.status()).toBe(404);
		// The app's own 404 page, inside its layout.
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("there's no card on a unit's page or on the dashboard", async () => {
		await app.go(`/equipment/${southUnit.serial_number}`);
		await app.page.getByText("Owner").first().waitFor();
		expect(await card().count()).toBe(0);
		await app.go("/");
		// The dashboard greets its member.
		await app.page
			.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening), / })
			.waitFor();
		expect(await app.page.locator("[data-maintenance-overview]").count()).toBe(0);
	});
});

describe("switching the module on and off in South", () => {
	let southPlan: Plan;

	// Where its sidebar entry goes is `nav.spec.ts`'s.
	test("switched on, a unit gets a plan", async () => {
		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Enable" }));
		await settingsCard()
			.getByText(/Enabled since/)
			.waitFor();

		await app.go(`/equipment/${southUnit.serial_number}`);
		await card().getByRole("button", { name: "Add plan" }).click();
		await dialog().getByLabel("Description").fill("Jaarlijks onderhoud");
		await dialog()
			.getByLabel("Next due on")
			.fill(dayKey(daysFromToday(5)));
		await app.submit(dialog().getByRole("button", { name: "Save plan" }));
		await card().getByText("Jaarlijks onderhoud").waitFor();
		[southPlan] = await plansOf(southUnit.id);
		expect(southPlan).toMatchObject({ organization_id: south.id, interval_months: 12 });
	});

	test("switched off, its page is gone but the plans are kept, and they're back when it's on", async () => {
		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Disable" }));
		await settingsCard().getByText("Disabled").waitFor();
		expect((await app.go("/maintenance"))?.status()).toBe(404);
		expect(await planById(southPlan.id)).toEqual(southPlan);

		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Enable" }));
		await settingsCard()
			.getByText(/Enabled since/)
			.waitFor();
		await app.go(`/equipment/${southUnit.serial_number}`);
		await card().getByText("Jaarlijks onderhoud").waitFor();
		expect(
			await rows(
				`select action from activity where organization_id = ? and subject_type = 'module'
				 and subject_id = 'maintenance' order by id`,
				[south.id],
			),
		).toEqual([
			{ action: "module_enabled" },
			{ action: "module_disabled" },
			{ action: "module_enabled" },
		]);
	});

	test("North can't change South's plan by its id", async () => {
		const { page } = app;
		await app.switchOrganization(north.name);
		const [own] = await rows<{ serial_number: string; description: string; id: number }>(
			`select e.serial_number, p.description, p.id from maintenance_plan p
			 join equipment e on e.id = p.equipment_id where p.organization_id = ? order by p.id limit 1`,
			[north.id],
		);
		const ownBefore = await planById(own.id);
		await app.go(`/equipment/${own.serial_number}`);

		// Editing it.
		await planMenu(own.description);
		await page.getByRole("menuitem", { name: "Edit" }).click();
		await dialog().getByLabel("Description").fill("Taken over");
		const edited = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
					String(id);
			}, southPlan.id);
			return app.submit(dialog().getByRole("button", { name: "Save plan" }));
		});
		expect(edited).toMatch(/"status":404/);
		await page.keyboard.press("Escape");

		// Pausing it.
		await tamperWithCommand<{ id: number }>(page, "pausePlan", (arg) => ({
			...arg,
			id: southPlan.id,
		}));
		await planMenu(own.description);
		const [paused] = await app.expectingErrors(() =>
			Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "pausePlan")),
				page.getByRole("menuitem", { name: /Pause|Resume/ }).click(),
			]),
		);
		expect(await paused.text()).toMatch(/"status":404/);

		// Deleting it.
		await planMenu(own.description);
		await page.getByRole("menuitem", { name: "Delete" }).click();
		const deleted = await app.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="alertdialog"] input[name^="id"]')!.value =
					String(id);
			}, southPlan.id);
			return app.submit(page.getByRole("alertdialog").getByRole("button", { name: "Delete" }));
		});
		expect(deleted).toMatch(/"status":404/);
		await page.keyboard.press("Escape");

		expect(await planById(southPlan.id)).toEqual(southPlan);
		expect(await planById(own.id)).toEqual(ownBefore);
		expect(
			await value(
				`select count(*) from activity where subject_type = 'maintenancePlan' and subject_id = ?`,
				[String(southPlan.id)],
			),
		).toBe(1);
	});

	test("switched off again, South is as it was", async () => {
		await app.switchOrganization(south.name);
		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Disable" }));
		await settingsCard().getByText("Disabled").waitFor();
		expect(await sidebarLinks()).not.toContain("Maintenance plans");
	});
});
