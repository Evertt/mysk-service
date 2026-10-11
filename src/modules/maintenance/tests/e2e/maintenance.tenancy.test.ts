import { describe, expect, test } from "vite-plus/test";

import { countIn, isRemote, organizations, rows, useApp, value } from "#e2e/app.ts";
import { remoteErrorStatus, tamperWithCommand, tamperWithQuery } from "#e2e/remote-functions.ts";

import { dayKey, daysFromToday, type Plan, pageLocators, planById, plansOf } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog, sidebarLinks, planMenu, settingsCard } = pageLocators(app);

/** The URLs of North's remote queries, as loaded in North, to try again from South. */
const queries: Record<string, string> = {};

/** A South unit, which North's forms are tampered to name. */
let southUnit: { id: number; serial_number: string };

describe("in North, which has the module", () => {
	test("its pages load their data with remote queries", async () => {
		const { page } = app;
		const record = (request: { url(): string }) => {
			for (const name of ["getDuePlans", "getUnitPlans", "getMaintenanceOverview"]) {
				if (isRemote(request.url(), name)) queries[name] = request.url();
			}
		};
		page.on("request", record);
		// Client-side, so the pages load their data through remote queries.
		await app.go("/activity");
		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Maintenance plans" }).click();
		await page.waitForURL((url) => url.pathname === "/maintenance");
		await app.tableSettled();
		await page.locator('[data-slot="data-table"] tbody tr a[href^="/equipment/"]').first().click();
		await card().waitFor();
		await sidebar.getByRole("link", { name: "Dashboard" }).click();
		await page.locator("[data-maintenance-overview]").waitFor();
		page.off("request", record);
		expect(Object.keys(queries).toSorted()).toEqual([
			"getDuePlans",
			"getMaintenanceOverview",
			"getUnitPlans",
		]);
	});

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
		await app.page.getByRole("heading", { name: "Dashboard" }).waitFor();
		expect(await app.page.locator("[data-maintenance-overview]").count()).toBe(0);
	});

	test("the equipment list has no Next maintenance column, and ignores its URL parameter", async () => {
		await app.go("/equipment?next-maintenance=overdue&sort=next-maintenance");
		expect(await app.page.locator("thead").getByText("Next maintenance").count()).toBe(0);
		expect(await app.rowCount()).toBe(await countIn("equipment", south.id));
		// Nor does the list's query take the column, tampered in.
		const { page } = app;
		await tamperWithQuery<{ filters: Record<string, unknown> }>(
			page,
			"getEquipmentList",
			(arg) => ({
				...arg,
				filters: { ...arg.filters, "maintenance.nextDue": ["overdue"] },
			}),
		);
		const status = await app.expectingErrors(async () => {
			const [response] = await Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "getEquipmentList")),
				page.locator("thead").getByRole("button", { name: "Installed" }).click(),
			]);
			return response.status() === 200 ? remoteErrorStatus(response) : response.status();
		});
		expect(status).toBe(400);
	});

	test("North's remote queries are refused", async () => {
		for (const [name, url] of Object.entries(queries)) {
			const response = await app.page.context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), `${name}: ${body}`).toBe(true);
		}
	});
});

describe("switching the module on and off in South", () => {
	let southPlan: Plan;

	test("switched on, it's in the sidebar after Equipment, and a unit gets a plan", async () => {
		await app.go("/settings");
		await app.submit(settingsCard().getByRole("button", { name: "Enable" }));
		await settingsCard()
			.getByText(/Enabled since/)
			.waitFor();
		await expect
			.poll(async () => {
				const links = await sidebarLinks();
				return links[links.indexOf("Equipment") + 1];
			})
			.toBe("Maintenance plans");

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
