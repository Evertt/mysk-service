/**
 * The checklist templates' pages, in North: a manager finds them from the settings, adds one, gives
 * it categories and points, moves and deletes a point, retires and restores it; a unit's page shows
 * its template; a member sees them without the buttons to change them. What the server does with
 * each change (placing, moving, logging, refusing a member's forms) is `templates.spec.ts`'s and
 * `template-pages.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, quiet, useApp, users } from "#e2e/app.ts";

import { pageLocators, templateNamed, unitOf } from "./helpers.ts";

const { north } = organizations;
const app = useApp();
const {
	dialog,
	alert,
	templateRow,
	gaps,
	pointsCard,
	categoriesCard,
	categoryBox,
	unitCard,
	settingsCard,
	sidebarLinks,
	shownPoints,
	pointMenu,
} = pageLocators(app);
const page = () => app.page;

/** The id of the template this file adds. */
let added: string;

/** Adds a point through the dialog, from the card's button. */
async function addPoint(group: string, text: string) {
	await pointsCard().getByRole("button", { name: "Add point", exact: true }).click();
	await dialog().getByLabel("Group").fill(group);
	await dialog().getByLabel("Point", { exact: true }).fill(text);
	await app.submit(dialog().getByRole("button", { name: "Save point" }));
	await app.toast("Point saved");
}

/**
 * Clicks a move button and waits for the server's answer and the page to settle. Not
 * `app.submit()`, which waits for the button to be enabled again: a point moved to the top keeps
 * its up button, disabled.
 */
async function move(label: string) {
	await Promise.all([
		page().waitForResponse(
			(r) => r.url().includes("/_app/remote") && r.request().method() === "POST",
		),
		page().getByRole("button", { name: label, exact: true }).click(),
	]);
	await quiet(page());
}

describe("an owner, in North", () => {
	test("finds the templates from the settings and the sidebar, with the categories they miss", async () => {
		await app.go("/settings");
		await settingsCard().getByRole("link", { name: "Set up" }).click();
		await page().waitForURL((url) => url.pathname === "/checklists/settings");
		await page().getByRole("heading", { name: "Checklist templates" }).first().waitFor();

		const shown = await page()
			.locator("tr[data-template]")
			.evaluateAll((trs: HTMLElement[]) => trs.map((tr) => tr.dataset.template));
		expect(shown).toEqual([
			"Stookinstallatie",
			"Koelmachine",
			"Luchtbehandelingskast",
			"Noodstroomaggregaat",
			"Lift",
		]);
		const row = (await templateRow("Koelmachine").innerText()).replace(/\s+/g, " ");
		expect(row).toBe("Koelmachine F-gassen 12 months Koelmachine 5");
		expect((await gaps().innerText()).replace(/\s+/g, " ")).toContain("Compressor Pomp");

		const links = await sidebarLinks();
		expect(links[links.indexOf("Equipment") + 1]).toBe("Work orders");
	});

	test("adds a template, with a name North doesn't have yet, and lands on its page", async () => {
		await page().getByRole("button", { name: "Add template" }).click();
		await dialog().getByLabel("Name").fill(" koelmachine ");
		await dialog().getByLabel("Inspection valid for (months)").fill("24");
		await app.submit(dialog().getByRole("button", { name: "Save template" }));
		expect(await app.issues()).toContain("There's a template Koelmachine already");

		await dialog().getByLabel("Name").fill("Compressor");
		await dialog().getByLabel("Norm").fill("NEN-EN 1012");
		await app.submit(dialog().getByRole("button", { name: "Save template" }));
		await page().waitForURL((url) => /^\/checklists\/settings\/\d+$/.test(url.pathname));
		await page().getByRole("heading", { name: "Compressor" }).waitFor();
		added = app.path().split("/").at(-1)!;
		expect(added).toBe(String((await templateNamed(north.id, "Compressor")).id));
		expect(await page().getByText("NEN-EN 1012").count()).toBeGreaterThan(0);
		expect(await pointsCard().getByText("No points yet").count()).toBe(1);
	});

	test("gives it categories; one another template is for can't be ticked", async () => {
		expect(await categoryBox("Koelmachine").isDisabled()).toBe(true);
		expect(await categoriesCard().locator('[data-category="Koelmachine"]').innerText()).toContain(
			"Has the template Koelmachine",
		);
		await categoryBox("Compressor").check();
		await categoryBox("Pomp").check();
		await app.submit(categoriesCard().getByRole("button", { name: "Save categories" }));
		await app.toast("Categories saved");

		await app.go("/checklists/settings");
		expect(await gaps().count()).toBe(0);
		expect(await templateRow("Compressor").innerText()).toContain("Pomp");
	});

	test("adds points in groups, moves one, and deletes one", async () => {
		await app.go(`/checklists/settings/${added}`);
		await addPoint("Smering", "Olie ververst");
		await addPoint("Veiligheid", "Drukschakelaar getest");
		// Through its group's own button, the group filled in.
		await pointsCard().getByRole("button", { name: "Add a point to Smering" }).click();
		expect(await dialog().getByLabel("Group").inputValue()).toBe("Smering");
		await dialog().getByLabel("Point", { exact: true }).fill("Filters vervangen");
		await app.submit(dialog().getByRole("button", { name: "Save point" }));
		await app.toast("Point saved");
		await expect
			.poll(shownPoints)
			.toEqual([
				"Smering:Olie ververst",
				"Smering:Filters vervangen",
				"Veiligheid:Drukschakelaar getest",
			]);
		expect(await pointsCard().innerText()).toContain("3 points");

		await move("Move point 2 up");
		await expect
			.poll(shownPoints)
			.toEqual([
				"Smering:Filters vervangen",
				"Smering:Olie ververst",
				"Veiligheid:Drukschakelaar getest",
			]);
		expect(await page().getByRole("button", { name: "Move point 1 up" }).isDisabled()).toBe(true);
		expect(
			await page().getByRole("button", { name: "Move group Veiligheid down" }).isDisabled(),
		).toBe(true);

		await pointMenu(1, "Delete");
		await app.submit(alert().getByRole("button", { name: "Delete" }));
		await app.toast("Point deleted");
		await expect
			.poll(shownPoints)
			.toEqual(["Smering:Olie ververst", "Veiligheid:Drukschakelaar getest"]);
	});

	test("retires it: kept with its points, its categories free, until it's restored", async () => {
		await page().getByRole("button", { name: "Retire" }).click();
		await app.submit(alert().getByRole("button", { name: "Retire" }));
		await app.toast("Template retired");
		await page().getByText("Retired", { exact: true }).waitFor();
		// It isn't changed while it's retired.
		expect(await pointsCard().getByRole("button", { name: "Add point" }).count()).toBe(0);
		expect(await categoriesCard().getByRole("checkbox").count()).toBe(0);

		await app.go("/checklists/settings");
		expect(
			await page()
				.locator("[data-checklist-retired]")
				.locator('tr[data-template="Compressor"]')
				.count(),
		).toBe(1);
		expect((await gaps().innerText()).replace(/\s+/g, " ")).toContain("Compressor Pomp");

		// Its unit's page offers none.
		await app.go(`/equipment/${await unitOf(north.id, "Compressor")}`);
		await unitCard().getByText("Compressor has no checklist template yet.").waitFor();

		await app.go(`/checklists/settings/${added}`);
		await app.submit(page().getByRole("button", { name: "Restore" }));
		await app.toast("Template restored");
		await pointsCard().getByRole("button", { name: "Add point" }).waitFor();
	});

	test("a unit's page shows the template of its category", async () => {
		await app.go(`/equipment/${await unitOf(north.id, "Koelmachine")}`);
		const card = unitCard();
		await card.waitFor();
		const text = (await card.innerText()).replace(/\s+/g, " ");
		expect(text).toContain("Units of Koelmachine are inspected by this template.");
		expect(text).toContain("F-gassen");
		expect(text).toContain("12 months");
		await card.getByRole("link", { name: "Koelmachine" }).click();
		await page().waitForURL((url) => url.pathname.startsWith("/checklists/settings/"));
		await page().getByRole("heading", { name: "Koelmachine" }).waitFor();
	});
});

describe("a member, in North", () => {
	test("sees the templates and their points, without the buttons to change them", async () => {
		const koelmachine = await templateNamed(north.id, "Koelmachine");
		await page().context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/checklists/settings");
		await templateRow("Koelmachine").waitFor();
		expect(await page().getByRole("button", { name: "Add template" }).count()).toBe(0);
		expect(await gaps().innerText()).toContain("Owners and admins change these.");

		await app.go(`/checklists/settings/${koelmachine.id}`);
		await pointsCard().getByText("Lekdichtheidscontrole uitgevoerd").waitFor();
		expect(await page().getByRole("button", { name: "Edit", exact: true }).count()).toBe(0);
		expect(await page().getByRole("button", { name: "Retire" }).count()).toBe(0);
		expect(await pointsCard().getByRole("button").count()).toBe(0);
		expect(await categoriesCard().getByRole("checkbox").count()).toBe(0);
		expect(await categoriesCard().innerText()).toContain("Koelmachine");
	});
});
