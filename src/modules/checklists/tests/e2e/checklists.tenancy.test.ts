/**
 * The checklists between tenants: North can't read or change SHLTR's templates (both have the
 * module), its template's page being a 404 and a form with a tampered id refused; South, which
 * doesn't have the module, has no pages or cards of it. Each of the module's functions refusing
 * another tenant's ids is the server specs' (`template-pages.spec.ts`, `order-checklists.spec.ts`,
 * `portal.spec.ts`, `work-orders.spec.ts`); that a tenant without the module is refused its routes
 * and remote functions is `route-guard.spec.ts`'s and `module-gate.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "#e2e/app.ts";

import { pageLocators, templateNamed, templatesOf } from "./helpers.ts";

const { north, south } = organizations;
const shltr = organizations.shltr;
const app = useApp();
const { dialog, unitCard, settingsCard, sidebarLinks, tamper } = pageLocators(app);
const page = () => app.page;

/** SHLTR's templates, points and category links as they are, to see they stay so. */
const shltrState = async () => ({
	templates: await templatesOf(shltr.id),
	points: await rows(
		`select * from checklist_template_item where organization_id = ? order by id`,
		[shltr.id],
	),
	categories: await rows(
		`select * from checklist_template_category where organization_id = ? order by category_id`,
		[shltr.id],
	),
});

describe("in North, which has the module", () => {
	test("SHLTR's templates can't be read or changed by their ids", async () => {
		const own = await templateNamed(north.id, "Koelmachine");
		const target = await templateNamed(shltr.id, "Sectionaaldeur");
		const before = await shltrState();
		const shltrLogged = () =>
			value(
				`select count(*) from activity where organization_id = ? and subject_type like 'checklist%'`,
				[shltr.id],
			);
		const loggedBefore = await shltrLogged();

		expect(
			(await app.expectingErrors(() => app.go(`/checklists/settings/${target.id}`)))?.status(),
		).toBe(404);
		await app.go(`/checklists/settings/${own.id}`);

		// Its details, through North's own template's form.
		await page().getByRole("button", { name: "Edit", exact: true }).click();
		await dialog().getByLabel("Name").fill("Overgenomen");
		const edited = await app.expectingErrors(async () => {
			await tamper(dialog(), "id", target.id);
			return app.submit(dialog().getByRole("button", { name: "Save template" }));
		});
		expect(edited).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		expect(await shltrState()).toEqual(before);
		expect((await templateNamed(north.id, "Koelmachine")).name).toBe("Koelmachine");
		// Nothing logged in SHLTR (another file on this worker may have logged its checklists before).
		expect(await shltrLogged()).toBe(loggedBefore);
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry and no set-up link, and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Work orders");
		await app.go("/settings");
		await settingsCard().getByRole("button", { name: "Enable" }).waitFor();
		expect(await settingsCard().getByRole("link", { name: "Set up" }).count()).toBe(0);

		const response = await app.go("/checklists/settings");
		expect(response?.status()).toBe(404);
		// The app's own 404 page, inside its layout.
		expect(await page().locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("an order's and a unit's pages have no checklists", async () => {
		const [order] = await rows<{ number: string; serial: string }>(
			`select o.number, e.serial_number as serial from "order" o join order_unit u on u.order_id = o.id
			 join equipment e on e.id = u.equipment_id
			 where o.organization_id = ? and o.type = 'inspection' limit 1`,
			[south.id],
		);
		await app.go(`/orders/${order.number}`);
		await page().getByRole("heading", { name: order.number }).waitFor();
		expect(await page().locator("[data-order-checklists]").count()).toBe(0);
		await app.go(`/equipment/${order.serial}`);
		await page().getByText("Owner").first().waitFor();
		expect(await page().locator("[data-unit-inspections]").count()).toBe(0);
		expect(await unitCard().count()).toBe(0);
	});
});
