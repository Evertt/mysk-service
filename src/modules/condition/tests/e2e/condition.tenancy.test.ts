/**
 * The condition module and tenancy: North, which has it, gets a 404 for a unit of SHLTR's (whose
 * cards would show its components) and can't record a condition for South's by a tampered serial
 * number; South, which doesn't have it, gets no page, card or tile. Each of the module's functions
 * refusing another tenant's units, components, articles and points, and North's lists showing only
 * its own, are the server specs' (`connect.spec.ts`, `components.spec.ts`, `conditions.spec.ts`);
 * that a tenant without the module is refused its remote functions is `module-gate.spec.ts`'s, and
 * its equipment list the module's columns `module-columns.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp } from "#e2e/app.ts";

import { conditionCount, pageLocators } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog, sidebarLinks } = pageLocators(app);

let southUnit: { id: number; serial_number: string };

describe("in North, which has the module", () => {
	test("a unit of SHLTR's, with its components, is a 404", async () => {
		const [theirs] = await rows<{ serial_number: string }>(
			`select e.serial_number from component c join equipment e on e.id = c.equipment_id
			 where c.organization_id = ? and e.serial_number not in
				(select serial_number from equipment where organization_id = ?)
			 order by c.id limit 1`,
			[organizations.shltr.id, north.id],
		);
		expect(theirs, "SHLTR has components").toBeDefined();
		const response = await app.expectingErrors(() => app.go(`/equipment/${theirs.serial_number}`));
		expect(response?.status()).toBe(404);
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
	test("there's no sidebar entry, its pages are 404s, and a unit's page and the dashboard have none of it", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Components");
		expect((await app.go("/condition?status=critical"))?.status()).toBe(404);
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);

		await app.go(`/equipment/${southUnit.serial_number}`);
		await app.page.getByText("Owner").first().waitFor();
		expect(await card().count()).toBe(0);
		expect(await app.page.locator("[data-unit-components]").count()).toBe(0);
		await app.go("/");
		await app.page.locator("[data-awaiting-link]").waitFor();
		expect(await app.page.locator("[data-condition-stat]").count()).toBe(0);
	});
});
