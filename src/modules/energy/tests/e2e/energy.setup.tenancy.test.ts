/**
 * Setting energy monitoring up, and who may: in SHLTR, its owner sets Bakkerij Tiel's site up and
 * can't, by tampering with the forms' ids, give it another tenant's site, a unit or zone of another
 * site, or edit another site's zone; its planner, a member who's no manager, sees the sites but
 * can't open the setup page, nor change anything by replaying the owner's form.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { riedel, setUpFromCustomer, shltrCustomer, shltrOwner, shltrPlanner } from "./helpers.ts";

const { north, shltr } = organizations;
const app = useApp({ user: shltrOwner });

/** The energy site this file sets up, and the owner's form that added its zone, as filled in. */
let siteId = 0;
let addedZone: { action: string; fields: (readonly [string, string])[] } | undefined;

/** The answer to a remote form's request: its error's status, if it failed. */
const errorStatus = (body: string) =>
	(JSON.parse(body) as { error?: { status?: number } }).error?.status;

/** Adds `value` to a select as an option and chooses it, like a tampered form. */
async function injectOption(select: ReturnType<typeof app.page.locator>, id: number) {
	await select.evaluate(
		(element: HTMLSelectElement, value) => element.add(new Option("Tampered", value)),
		String(id),
	);
	await select.selectOption(String(id));
}

describe("a manager's forms", () => {
	test("set Bakkerij Tiel's site up, with a zone", async () => {
		const { page } = app;
		const bakkerij = await shltrCustomer("Bakkerij Tiel");
		siteId = await setUpFromCustomer(page, { code: bakkerij.code, siteId: bakkerij.site("Tiel") });
		await page.getByRole("button", { name: "Add zone" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Code").fill("Z-T");
		await dialog.getByLabel("Name", { exact: true }).fill("Bakkerij");
		addedZone = await dialog.locator("form").evaluate((form: HTMLFormElement) => ({
			action: form.getAttribute("action")!,
			fields: [...new FormData(form)].map(
				([name, value]) => [name, typeof value === "string" ? value : value.name] as const,
			),
		}));
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		await page.locator('[data-setup-zone="Z-T"]').waitFor();
		expect(
			await rows(`select code, name from energy_zone where energy_site_id = ?`, [siteId]),
		).toEqual([{ code: "Z-T", name: "Bakkerij" }]);
		expect(addedZone.fields.some(([name]) => /^code(\/|$)/.test(name))).toBe(true);
	});

	test("can't give a site another tenant's customer site", async () => {
		const { page } = app;
		const theirs = Number(
			await value(`select min(id) from customer_site where organization_id = ?`, [north.id]),
		);
		await app.go("/energy");
		await page.getByRole("button", { name: "Add energy site" }).click();
		const dialog = page.getByRole("dialog");
		await dialog.getByLabel("Contracted peak (kW)").fill("100");
		await dialog.getByLabel("Contracted kWh a year").fill("1000");
		await injectOption(dialog.getByLabel("Customer site"), theirs);
		const result = await app.expectingErrors(() =>
			app.submit(dialog.getByRole("button", { name: "Add energy site" })),
		);
		expect(errorStatus(result)).toBe(404);
		expect(await value(`select count(*) from energy_site where site_id = ?`, [theirs])).toBe(0);
		await page.keyboard.press("Escape");
	});

	test("can't give a door a unit of another site or tenant, nor a consumer another site's zone", async () => {
		const { page } = app;
		const { door, zone } = await riedel();
		const riedelUnit = door("D-VR1").equipment_id!;
		const northUnit = Number(
			await value(`select min(id) from equipment where organization_id = ?`, [north.id]),
		);
		await app.go(`/energy/${siteId}/setup`);
		const dialog = page.getByRole("dialog");
		for (const unit of [riedelUnit, northUnit]) {
			await page.getByRole("button", { name: "Add door" }).click();
			await dialog.getByLabel("Code").fill("D-T");
			await dialog.getByLabel("Name", { exact: true }).fill("Achterdeur");
			await dialog.getByLabel("Loss while open (kW)").fill("3");
			await injectOption(dialog.getByLabel("Unit"), unit);
			await app.submit(dialog.getByRole("button", { name: "Save" }));
			expect(await app.issues()).toContain("Choose one of this site's units");
			await page.keyboard.press("Escape");
			await dialog.waitFor({ state: "detached" });
		}

		await page.getByRole("button", { name: "Add consumer" }).click();
		await dialog.getByLabel("Name", { exact: true }).fill("Oven");
		await dialog.getByLabel("Rated power (kW)").fill("40");
		await injectOption(dialog.getByLabel("Zone"), zone("Z-R61").id);
		await app.submit(dialog.getByRole("button", { name: "Save" }));
		expect(await app.issues()).toContain("Choose one of this site's zones");
		await page.keyboard.press("Escape");
		await dialog.waitFor({ state: "detached" });

		expect(await value(`select count(*) from energy_door where energy_site_id = ?`, [siteId])).toBe(
			0,
		);
		expect(
			await value(
				`select count(*) from energy_consumer c join energy_zone z on z.id = c.zone_id
				 where z.energy_site_id = ?`,
				[siteId],
			),
		).toBe(0);
	});

	test("can't edit another site's zone through this one", async () => {
		const { page } = app;
		const target = (await riedel()).zone("Z-R61");
		const before = await rows(`select * from energy_zone where id = ?`, [target.id]);
		await page.getByRole("button", { name: "Edit zone Z-T" }).click();
		const dialog = page.getByRole("dialog");
		const hidden = dialog.locator('input[type="hidden"][name^="zoneId/"]');
		await expect.poll(() => hidden.count()).toBe(1);
		const result = await app.expectingErrors(async () => {
			await hidden.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);
			await dialog.getByLabel("Name", { exact: true }).fill("Tampered");
			return app.submit(dialog.getByRole("button", { name: "Save" }));
		});
		expect(errorStatus(result)).toBe(404);
		expect(await rows(`select * from energy_zone where id = ?`, [target.id])).toEqual(before);
		await page.keyboard.press("Escape");
	});
});

describe("a member who's no manager", () => {
	test("sees the site, but not its setup, and can't change it", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		try {
			const bakkerij = await shltrCustomer("Bakkerij Tiel");
			await page.goto(new URL(`/customers/${bakkerij.code}`, page.url()).href);
			const card = page.locator(`[data-energy-card-site="${bakkerij.site("Tiel")}"]`);
			await card.getByRole("link").first().waitFor();
			expect(await page.locator("[data-energy-add-site]").count()).toBe(0);
			expect(await card.getByRole("link", { name: /^Set up/ }).count()).toBe(0);

			await page.goto(new URL(`/energy/${siteId}`, page.url()).href);
			await page.getByRole("heading", { name: "Bakkerij Tiel — Tiel" }).waitFor();
			expect(await page.getByRole("link", { name: "Set up" }).count()).toBe(0);
			const setup = await page.goto(new URL(`/energy/${siteId}/setup`, page.url()).href);
			expect(setup?.status()).toBe(403);

			// The owner's form, with a code of its own, posted from a page the planner may see: as a
			// form without JavaScript posts it, to the page with the remote form's action.
			await page.goto(new URL(`/energy/${siteId}`, page.url()).href);
			await page.getByRole("heading", { name: "Bakkerij Tiel — Tiel" }).waitFor();
			const fields = addedZone!.fields.map(([name, field]) =>
				/^code(\/|$)/.test(name) ? ([name, "Z-PLANNER"] as const) : ([name, field] as const),
			);
			const [posted] = await Promise.all([
				page.waitForResponse((response) => response.request().method() === "POST"),
				page.evaluate(
					({ action, fields }) => {
						const form = document.createElement("form");
						form.method = "POST";
						form.action = action;
						for (const [name, value] of fields) {
							const input = document.createElement("input");
							input.name = name;
							input.value = value;
							form.append(input);
						}
						document.body.append(form);
						form.submit();
					},
					{ action: addedZone!.action, fields },
				),
			]);
			expect(posted.status()).toBe(403);
			expect(await value(`select count(*) from energy_zone where code = 'Z-PLANNER'`)).toBe(0);
			expect(await value(`select organization_id from energy_site where id = ?`, [siteId])).toBe(
				shltr.id,
			);
		} finally {
			await page.context().close();
		}
	});
});
