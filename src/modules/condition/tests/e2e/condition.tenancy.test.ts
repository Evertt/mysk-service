/**
 * The condition module and tenancy: North, which has it, sees only its own units and can't record
 * a condition for South's by a tampered serial number; South, which doesn't have it, gets no page,
 * card, tile or column, and North's remote queries are refused there.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	isRemote,
	organizations,
	remoteErrorStatus,
	rows,
	tamperWithQuery,
	useApp,
} from "#e2e/app.ts";

import { conditionCount, pageLocators, unitStates } from "./helpers.ts";

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
		await sidebar.getByRole("link", { name: "Connect" }).click();
		await page.waitForURL((url) => url.pathname === "/condition");
		await app.tableSettled();
		expect(await app.rowCount()).toBe((await unitStates(north.id)).length);
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
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry, and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Connect");
		expect((await app.go("/condition?status=critical"))?.status()).toBe(404);
		expect((await app.go("/condition/settings"))?.status()).toBe(404);
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("there's no card on a unit's page, nor a tile on the dashboard", async () => {
		await app.go(`/equipment/${southUnit.serial_number}`);
		await app.page.getByText("Owner").first().waitFor();
		expect(await card().count()).toBe(0);
		await app.go("/");
		await app.page.getByRole("heading", { name: "Dashboard" }).waitFor();
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
