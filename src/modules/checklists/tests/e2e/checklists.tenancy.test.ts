/**
 * The checklist templates between tenants: North can't read or change SHLTR's (both have the
 * module) by tampering with ids, and South, which doesn't have the module, has no pages, card or
 * data of it.
 */
import { describe, expect, test } from "vite-plus/test";

import { isRemote, organizations, rows, useApp, value } from "#e2e/app.ts";

import { pageLocators, pointRows, templateNamed, templatesOf, unitOf } from "./helpers.ts";

const { north, south } = organizations;
const shltr = { id: "org-shltr" };
const app = useApp();
const {
	dialog,
	alert,
	pointsCard,
	categoriesCard,
	categoryBox,
	unitCard,
	settingsCard,
	sidebarLinks,
	pointMenu,
	tamper,
} = pageLocators(app);
const page = () => app.page;

/** The URLs of North's remote queries, as loaded in North, to try again from South. */
const queries: Record<string, string> = {};

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
	test("its pages load their data with remote queries", async () => {
		const record = (request: { url(): string }) => {
			for (const name of ["getTemplates", "getTemplate", "getUnitTemplate"]) {
				if (isRemote(request.url(), name)) queries[name] = request.url();
			}
		};
		page().on("request", record);
		// Client-side, so the pages load their data through remote queries.
		await app.go("/activity");
		const sidebar = page().locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Checklists" }).click();
		await page().waitForURL((url) => url.pathname === "/checklists/templates");
		await page().getByRole("link", { name: "Koelmachine" }).click();
		await pointsCard().waitFor();
		await sidebar.getByRole("link", { name: "Equipment" }).click();
		await app.tableSettled();
		await page()
			.locator('[data-slot="data-table"] tbody tr a[href^="/equipment/"]')
			.first()
			.click();
		await unitCard().waitFor();
		page().off("request", record);
		expect(Object.keys(queries).toSorted()).toEqual([
			"getTemplate",
			"getTemplates",
			"getUnitTemplate",
		]);
	});

	test("SHLTR's templates and points can't be read or changed by their ids", async () => {
		const own = await templateNamed(north.id, "Koelmachine");
		const target = await templateNamed(shltr.id, "Sectionaaldeur");
		const [targetPoint] = await pointRows(target.id);
		const targetCategory = Number(
			await value(`select id from equipment_category where organization_id = ? limit 1`, [
				shltr.id,
			]),
		);
		const before = await shltrState();
		const ownPoints = await pointRows(own.id);

		expect(
			(await app.expectingErrors(() => app.go(`/checklists/templates/${target.id}`)))?.status(),
		).toBe(404);
		await app.go(`/checklists/templates/${own.id}`);

		// Its details.
		await page().getByRole("button", { name: "Edit", exact: true }).click();
		await dialog().getByLabel("Name").fill("Overgenomen");
		const edited = await app.expectingErrors(async () => {
			await tamper(dialog(), "id", target.id);
			return app.submit(dialog().getByRole("button", { name: "Save template" }));
		});
		expect(edited).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		// Its categories, and a category of SHLTR's for North's own template.
		const categories = categoriesCard().locator("form");
		const retargeted = await app.expectingErrors(async () => {
			await tamper(categories, "id", target.id);
			return app.submit(categoriesCard().getByRole("button", { name: "Save categories" }));
		});
		expect(retargeted).toMatch(/"status":404/);
		await app.go(`/checklists/templates/${own.id}`);
		await categoryBox("Compressor").check();
		const borrowed = await app.expectingErrors(async () => {
			await categoryBox("Compressor").evaluate(
				(input: HTMLInputElement, id) => (input.value = String(id)),
				targetCategory,
			);
			return app.submit(categoriesCard().getByRole("button", { name: "Save categories" }));
		});
		expect(borrowed).toMatch(/"status":404/);

		// A new point for it.
		await app.go(`/checklists/templates/${own.id}`);
		await pointsCard().getByRole("button", { name: "Add point", exact: true }).click();
		await dialog().getByLabel("Point", { exact: true }).fill("Niet van ons");
		const pointAdded = await app.expectingErrors(async () => {
			await tamper(dialog(), "templateId", target.id);
			return app.submit(dialog().getByRole("button", { name: "Save point" }));
		});
		expect(pointAdded).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		// Its points: editing, moving and deleting one.
		await pointMenu(1, "Edit");
		await dialog().getByLabel("Point", { exact: true }).fill("Overgenomen");
		const pointEdited = await app.expectingErrors(async () => {
			await tamper(dialog(), "id", targetPoint.id);
			return app.submit(dialog().getByRole("button", { name: "Save point" }));
		});
		expect(pointEdited).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		const move = page().getByRole("button", { name: "Move point 1 down" });
		const moved = await app.expectingErrors(async () => {
			await tamper(move.locator("xpath=ancestor::form"), "id", targetPoint.id);
			return app.submit(move);
		});
		expect(moved).toMatch(/"status":404/);

		await pointMenu(1, "Delete");
		const deleted = await app.expectingErrors(async () => {
			await tamper(alert(), "id", targetPoint.id);
			return app.submit(alert().getByRole("button", { name: "Delete" }));
		});
		expect(deleted).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		// Retiring it.
		await page().getByRole("button", { name: "Retire" }).click();
		const retired = await app.expectingErrors(async () => {
			await tamper(alert(), "id", target.id);
			return app.submit(alert().getByRole("button", { name: "Retire" }));
		});
		expect(retired).toMatch(/"status":404/);
		await page().keyboard.press("Escape");

		expect(await shltrState()).toEqual(before);
		expect(await pointRows(own.id)).toEqual(ownPoints);
		expect((await templateNamed(north.id, "Koelmachine")).name).toBe("Koelmachine");
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and subject_type like 'checklist%'`,
				[shltr.id],
			),
		).toBe(0);
	});
});

describe("in South, which doesn't have the module", () => {
	test("there's no sidebar entry and no set-up link, and its pages are 404s", async () => {
		await app.switchOrganization(south.name);
		expect(await sidebarLinks()).not.toContain("Checklists");
		await app.go("/settings");
		await settingsCard().getByRole("button", { name: "Enable" }).waitFor();
		expect(await settingsCard().getByRole("link", { name: "Set up" }).count()).toBe(0);

		const northTemplate = await templateNamed(north.id, "Koelmachine");
		for (const path of ["/checklists/templates", `/checklists/templates/${northTemplate.id}`]) {
			const response = await app.go(path);
			expect(response?.status(), path).toBe(404);
		}
		// The app's own 404 page, inside its layout.
		expect(await page().locator('[data-sidebar="content"]').count()).toBe(1);
	});

	test("there's no card on a unit's page", async () => {
		await app.go(`/equipment/${await unitOf(south.id, "Koelmachine")}`);
		await page().getByText("Owner").first().waitFor();
		expect(await unitCard().count()).toBe(0);
	});

	test("North's remote queries are refused", async () => {
		expect(Object.keys(queries)).toHaveLength(3);
		for (const [name, url] of Object.entries(queries)) {
			const response = await page().context().request.get(url);
			const body = await response.text();
			expect(response.status() === 404 || /"status":404/.test(body), `${name}: ${body}`).toBe(true);
		}
		expect(await templatesOf(south.id)).toEqual([]);
	});
});
