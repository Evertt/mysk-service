/**
 * The checklists between tenants: North can't read or change SHLTR's templates (both have the
 * module), its template's page being a 404 and a form with a tampered id refused, nor read SHLTR's
 * checklists on orders, also by a tampered query; South, which doesn't have the module, has no
 * pages or cards of it. Each of the module's functions refusing another tenant's ids is
 * `templates.spec.ts`'s and `checklists.spec.ts`'s; that a tenant without the module is refused its
 * routes and remote functions is `route-guard.spec.ts`'s and `remote-functions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { isRemote, organizations, rows, tamperWithQuery, useApp, value } from "#e2e/app.ts";

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

/** An order number of SHLTR's with checklists that North has no order of. */
const shltrOnly = () =>
	value<string>(
		`select o.number from "order" o where o.organization_id = ?
		 and exists (select 1 from checklist c where c.order_id = o.id)
		 and o.number not in (select number from "order" where organization_id = ?)
		 order by o.id limit 1`,
		[shltr.id, north.id],
	);

/** Follows a link to `href` in the page, as a click would: a client-side navigation. */
const navigate = (href: string) =>
	page().evaluate((to) => {
		const link = document.createElement("a");
		link.href = to;
		document.body.append(link);
		link.click();
		link.remove();
	}, href);

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
			(await app.expectingErrors(() => app.go(`/checklists/templates/${target.id}`)))?.status(),
		).toBe(404);
		await app.go(`/checklists/templates/${own.id}`);

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

	test("SHLTR's checklists can't be read, also by a tampered query", async () => {
		const number = await shltrOnly();
		expect(
			(await app.expectingErrors(() => app.go(`/checklists/work-orders/${number}`)))?.status(),
		).toBe(404);
		const [first, second] = await rows<{ number: string }>(
			`select distinct o.number from checklist c join "order" o on o.id = c.order_id
			 where c.organization_id = ? order by o.id limit 2`,
			[north.id],
		);
		await app.go(`/orders/${first.number}`);
		await page().locator("[data-order-checklists]").waitFor();
		const answer = page().waitForResponse((response) =>
			isRemote(response.url(), "getOrderChecklists"),
		);
		await app.expectingErrors(async () => {
			// The next order's card asks for SHLTR's order instead.
			await tamperWithQuery<string>(page(), "getOrderChecklists", () => number);
			await navigate(`/orders/${second.number}`);
			expect(await (await answer).text()).toMatch(/"status":404/);
		});
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry and no set-up link, and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Work orders");
		await app.go("/settings");
		await settingsCard().getByRole("button", { name: "Enable" }).waitFor();
		expect(await settingsCard().getByRole("link", { name: "Set up" }).count()).toBe(0);

		const response = await app.go("/checklists/templates");
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
