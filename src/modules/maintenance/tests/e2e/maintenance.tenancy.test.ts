/**
 * Maintenance plans across tenants: one form tampered to name another tenant's unit, and a tenant
 * without the module (South): no sidebar entry, its page is a 404 and core's pages show none of
 * it. The rest (each remote function refusing the other tenant's plans and units, the lists showing
 * the tenant's own, the plans kept while the module is off) is `../unit/server/plans.spec.ts`'s,
 * and the module's gate `module-gate.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp } from "#e2e/app.ts";

import { dayKey, daysFromToday, pageLocators, plansOf } from "./helpers.ts";

const { north, south } = organizations;
const app = useApp();
const { card, dialog, sidebarLinks } = pageLocators(app);

/** A South unit, which North's form is tampered to name. */
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
	test("there's no sidebar entry, its page is a 404, and no card on a unit's page or the dashboard", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Maintenance plans");
		const response = await app.go("/maintenance?due=overdue");
		expect(response?.status()).toBe(404);
		// The app's own 404 page, inside its layout.
		expect(await app.page.locator('[data-sidebar="content"]').count()).toBe(1);

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
