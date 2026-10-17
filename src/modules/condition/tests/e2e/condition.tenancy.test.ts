/**
 * The condition module and tenancy: North, which has it, sees only its own units and can't record
 * a condition for South's by a tampered serial number, nor see or change another tenant's (SHLTR's)
 * components by tampered ids, nor give its own another tenant's article or checklist points; South,
 * which doesn't have it, gets no page, card, tile or column, and North's remote queries are refused
 * there.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	isRemote,
	organizations,
	remoteErrorStatus,
	rows,
	tamperWithQuery,
	useApp,
	value,
} from "#e2e/app.ts";

import {
	checkpointsOf,
	componentConditionsOf,
	componentsOf,
	conditionCount,
	pageLocators,
	rowsOf,
	unitStates,
} from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog, sidebarLinks } = pageLocators(app);

/** The URLs of North's remote queries, as loaded in North, to try again from South. */
const queries: Record<string, string> = {};
let southUnit: { id: number; serial_number: string };

describe("in North, which has the module", () => {
	test("the Connect page lists North's units in care only, through remote queries", async () => {
		const { page } = app;
		const record = (request: { url(): string }) => {
			for (const name of [
				"getConditionUnits",
				"getConditionCounts",
				"getUnitCondition",
				"getConditionOverview",
				"getServiceHistory",
			]) {
				if (isRemote(request.url(), name)) queries[name] = request.url();
			}
		};
		page.on("request", record);
		// Client-side, so the pages load their data through remote queries.
		await app.go("/activity");
		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Components" }).click();
		await page.waitForURL((url) => url.pathname === "/condition");
		await app.tableSettled();
		expect(await app.rowCount()).toBe(rowsOf(await unitStates(north.id)).length);
		await page.getByRole("button", { name: "Activity log" }).click();
		await page.getByRole("dialog").locator("[data-feed-entry]").first().waitFor();
		await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
		await page.locator('[data-slot="data-table"] tbody tr a[href^="/equipment/"]').first().click();
		await card().waitFor();
		await sidebar.getByRole("link", { name: "Dashboard" }).click();
		await page.locator("[data-condition-stat]").waitFor();
		page.off("request", record);
		expect(Object.keys(queries).toSorted()).toEqual([
			"getConditionCounts",
			"getConditionOverview",
			"getConditionUnits",
			"getServiceHistory",
			"getUnitCondition",
		]);
	});

	test("a condition for another tenant's unit is refused", async () => {
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
		await card().getByRole("button", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("10");
		const before = await conditionCount();
		const result = await app.expectingErrors(async () => {
			await page.evaluate((serial) => {
				document.querySelector<HTMLInputElement>(
					'[role="dialog"] input[name^="serialNumber"]',
				)!.value = serial;
			}, southUnit.serial_number);
			return app.submit(dialog().getByRole("button", { name: "Save condition" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(await conditionCount()).toBe(before);
		await page.keyboard.press("Escape");
	});

	test("another tenant's components can't be seen or changed by their ids", async () => {
		const { page } = app;
		const [theirs] = await rows<{
			id: number;
			equipment_id: number;
			serial_number: string;
			name: string;
		}>(
			`select c.id, c.equipment_id, e.serial_number, c.name from component c
			 join equipment e on e.id = c.equipment_id where c.organization_id = ? order by c.id limit 1`,
			[organizations.shltr.id],
		);
		expect(theirs, "SHLTR has components").toBeDefined();
		// Its unit's page is a 404 here, and so is its components' query.
		const response = await app.expectingErrors(() => app.go(`/equipment/${theirs.serial_number}`));
		expect(response?.status()).toBe(404);

		// A component of North's own, to tamper with, on a unit whose category has a checklist.
		const [own] = await rows<{ id: number; serial_number: string }>(
			`select e.id, e.serial_number from equipment e
			 join checklist_template_category t on t.category_id = e.category_id
			 where e.organization_id = ? and e.status <> 'decommissioned' order by e.id limit 1`,
			[north.id],
		);
		await app.go(`/equipment/${own.serial_number}`);
		const components = page.locator("[data-unit-components]");
		await components.getByRole("button", { name: "Add component" }).click();
		await dialog().getByLabel("Name").fill("Veerset");
		await dialog().getByRole("button", { name: "Save" }).click();
		await app.toast("Component saved");
		const [made] = await componentsOf(own.id);
		expect(made).toMatchObject({ organization_id: north.id, name: "Veerset", number: "OC-0001" });

		const before = await componentsOf(theirs.equipment_id);
		const hidden = (name: string, to: string) =>
			page.evaluate(
				([name, to]) => {
					document.querySelector<HTMLInputElement>(
						`[role="dialog"] input[name^="${name}"]`,
					)!.value = to;
				},
				[name, to],
			);
		const actions = () => components.getByRole("button", { name: "Actions for Veerset" });

		// Changing theirs by its id.
		await actions().click();
		await page.getByRole("menuitem", { name: "Edit" }).click();
		await dialog().getByLabel("Name").fill("Gekaapt");
		expect(
			await app.expectingErrors(async () => {
				await hidden("id", String(theirs.id));
				return app.submit(dialog().getByRole("button", { name: "Save" }));
			}),
		).toMatch(/"status":404/);
		await page.keyboard.press("Escape");

		// Recording its condition by its id.
		const conditions = await componentConditionsOf(theirs.id);
		await actions().click();
		await page.getByRole("menuitem", { name: "Record condition" }).click();
		await dialog().getByLabel("Condition (%)").fill("5");
		expect(
			await app.expectingErrors(async () => {
				await hidden("componentId", String(theirs.id));
				return app.submit(dialog().getByRole("button", { name: "Save condition" }));
			}),
		).toMatch(/"status":404/);
		await page.keyboard.press("Escape");
		expect(await componentConditionsOf(theirs.id)).toEqual(conditions);

		// Removing it by its id.
		await actions().click();
		await page.getByRole("menuitem", { name: "Remove" }).click();
		expect(
			await app.expectingErrors(async () => {
				await page.evaluate((id) => {
					document.querySelector<HTMLInputElement>(
						'[role="alertdialog"] input[name^="id"]',
					)!.value = id;
				}, String(theirs.id));
				return app.submit(page.getByRole("alertdialog").getByRole("button", { name: "Remove" }));
			}),
		).toMatch(/"status":404/);
		await page.keyboard.press("Escape");
		expect(await componentsOf(theirs.equipment_id)).toEqual(before);
	});

	test("its own component takes neither another tenant's article nor its checklist points", async () => {
		const { page } = app;
		const [own] = await rows<{ id: number }>(
			`select equipment_id as id from component where organization_id = ? order by id limit 1`,
			[north.id],
		);
		const [made] = await componentsOf(own.id);
		const article = await value<number>(
			`select id from material where organization_id = ? order by id limit 1`,
			[organizations.shltr.id],
		);
		const point = await value<number>(
			`select id from checklist_template_item where organization_id = ? order by id limit 1`,
			[organizations.shltr.id],
		);
		const components = page.locator("[data-unit-components]");
		const edit = async () => {
			await components.getByRole("button", { name: "Actions for Veerset" }).click();
			await page.getByRole("menuitem", { name: "Edit" }).click();
		};
		const refused = async (message: string) => {
			const result = await app.expectingErrors(() =>
				app.submit(dialog().getByRole("button", { name: "Save" })),
			);
			expect(result).toContain(JSON.stringify(message).slice(1, -1));
			await page.keyboard.press("Escape");
		};

		// Another tenant's material as its article.
		await edit();
		await dialog()
			.locator('select[name^="materialId"]')
			.evaluate((select: HTMLSelectElement, id) => {
				select.add(new Option("SD-001", id));
				select.value = id;
				select.dispatchEvent(new Event("input", { bubbles: true }));
				select.dispatchEvent(new Event("change", { bubbles: true }));
			}, String(article));
		await refused("That article isn't one of your materials.");

		// Another tenant's template point as one that checks it.
		await edit();
		const box = dialog().locator('input[type="checkbox"]').first();
		await box.evaluate((input: HTMLInputElement, id) => (input.value = id), String(point));
		await box.check();
		await refused("Those checklist points aren't the unit's.");

		const [after] = await componentsOf(own.id);
		expect(after).toEqual(made);
		expect(await checkpointsOf(made.id)).toEqual([]);
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry, and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Components");
		expect((await app.go("/condition?status=critical"))?.status()).toBe(404);
		expect((await app.go("/condition/settings"))?.status()).toBe(404);
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("there's no card on a unit's page, nor a tile on the dashboard", async () => {
		await app.go(`/equipment/${southUnit.serial_number}`);
		await app.page.getByText("Owner").first().waitFor();
		expect(await card().count()).toBe(0);
		expect(await app.page.locator("[data-unit-components]").count()).toBe(0);
		await app.go("/");
		await app.page.locator("[data-awaiting-link]").waitFor();
		expect(await app.page.locator("[data-condition-stat]").count()).toBe(0);
	});

	test("the equipment list has no condition columns, and refuses them in its query", async () => {
		const { page } = app;
		await app.go("/equipment?condition-status=critical&sort=condition");
		expect(await page.locator("thead").getByText("Condition status").count()).toBe(0);
		await tamperWithQuery<{ filters: Record<string, unknown> }>(
			page,
			"getEquipmentList",
			(arg) => ({ ...arg, filters: { ...arg.filters, "condition.status": ["critical"] } }),
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
