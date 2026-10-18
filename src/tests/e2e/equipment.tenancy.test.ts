/**
 * South's equipment: the switch, North's unit a 404, and the edit form with a North unit's id
 * refused. What the equipment's remote functions answer South for North's ids and records (the
 * list, its facets and groups, a unit's history, deleting, North's customers, sites, categories and
 * serial numbers) is `equipment/server/list.spec.ts`'s and `units.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { afresh, countIn, organizations, useApp } from "./app.ts";
import { busiest, northOnly, unit } from "./equipment-helpers.ts";

const { south } = organizations;
const app = useApp();

describe("in South", () => {
	// That the list has exactly the tenant's rows is its SQL's (`plan.spec.ts`, "never returns
	// another tenant's rows").
	test("switching organization shows South's units", async () => {
		await app.switchOrganization(south.name);
		expect(await app.page.locator('[data-sidebar="header"]').innerText()).toContain(south.name);
		await app.go(afresh("/equipment"));
		expect(await app.rowCount()).toBe(await countIn("equipment", south.id));
	});

	test("North's units are a 404", async () => {
		const { serial } = await northOnly();
		expect((await app.go(`/equipment/${serial}`))?.status()).toBe(404);
		expect((await app.go(`/equipment/${serial}/edit`))?.status()).toBe(404);
	});

	test("saving with the id of a North unit is refused", async () => {
		const { page } = app;
		const target = await northOnly();
		const own = await busiest(south.id);
		const [targetBefore, ownBefore] = [await unit(target.id), await unit(own.id)];

		await app.go(`/equipment/${own.serial}/edit`);
		const hidden = page.locator('form input[type="hidden"][name^="id/"]');
		expect(await hidden.inputValue()).toBe(String(own.id));
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);
			await page.getByLabel("Model").fill("TAMPERED");
			return app.submit(page.getByRole("button", { name: "Save equipment" }));
		});
		expect(result).toMatch(/"status":404/);
		expect(app.path()).toBe(`/equipment/${own.serial}/edit`);
		expect(await unit(target.id)).toEqual(targetBefore);
		expect(await unit(own.id)).toEqual(ownBefore);
	});
});
