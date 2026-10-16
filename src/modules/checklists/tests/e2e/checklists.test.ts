/**
 * The checklist templates, in North: a manager finds them from the settings, adds one, gives it
 * categories and points, reorders, edits and deletes points, retires and restores it; a unit's page
 * shows its template; a member sees them but can't change them.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, quiet, useApp, users } from "#e2e/app.ts";

import {
	categoriesOf,
	lastActivityId,
	pageLocators,
	pointRows,
	pointsOf,
	type Template,
	templateActivity,
	templateNamed,
	templatesOf,
	unitOf,
} from "./helpers.ts";

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

/** The template this file adds. */
let added: Template;

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

/** A form on the page as a browser without JavaScript would submit it. */
const captureForm = (form: ReturnType<Page["locator"]>) =>
	form.evaluate((element: HTMLFormElement) => ({
		action: element.action,
		fields: [...new FormData(element)].map(([name, value]) => [name, value as string]),
	}));

/** Posts a captured form from the page, with its session; answers with the status. */
const post = (form: Awaited<ReturnType<typeof captureForm>>) =>
	app.expectingErrors(() =>
		page().evaluate(async ({ action, fields }) => {
			const body = new URLSearchParams(fields);
			const headers = { accept: "text/html" };
			return (await fetch(action, { method: "POST", body, headers })).status;
		}, form),
	);

describe("an owner, in North", () => {
	test("finds the templates from the settings and the sidebar, with the categories they miss", async () => {
		await app.go("/settings");
		await settingsCard().getByRole("link", { name: "Set up" }).click();
		await page().waitForURL((url) => url.pathname === "/checklists/templates");
		await page().getByRole("heading", { name: "Checklist templates" }).first().waitFor();

		const seeded = await templatesOf(north.id);
		expect(seeded.map((template) => template.name)).toEqual([
			"Stookinstallatie",
			"Koelmachine",
			"Luchtbehandelingskast",
			"Noodstroomaggregaat",
			"Lift",
		]);
		const shown = await page()
			.locator("tr[data-template]")
			.evaluateAll((trs: HTMLElement[]) => trs.map((tr) => tr.dataset.template));
		expect(shown).toEqual(seeded.map((template) => template.name));
		const row = (await templateRow("Koelmachine").innerText()).replace(/\s+/g, " ");
		expect(row).toBe("Koelmachine F-gassen 12 months Koelmachine 5");
		expect((await gaps().innerText()).replace(/\s+/g, " ")).toContain("Compressor Pomp");

		const links = await sidebarLinks();
		expect(links[links.indexOf("Equipment") + 1]).toBe("Checklists");
	});

	test("adds a template, with a name North doesn't have yet, and lands on its page", async () => {
		const since = await lastActivityId();
		await page().getByRole("button", { name: "Add template" }).click();
		await dialog().getByLabel("Name").fill(" koelmachine ");
		await dialog().getByLabel("Inspection valid for (months)").fill("24");
		await app.submit(dialog().getByRole("button", { name: "Save template" }));
		expect(await app.issues()).toContain("There's a template Koelmachine already");

		await dialog().getByLabel("Name").fill("Compressor");
		await dialog().getByLabel("Norm").fill("NEN-EN 1012");
		await app.submit(dialog().getByRole("button", { name: "Save template" }));
		await page().waitForURL((url) => /^\/checklists\/templates\/\d+$/.test(url.pathname));
		await page().getByRole("heading", { name: "Compressor" }).waitFor();

		added = await templateNamed(north.id, "Compressor");
		expect(added).toMatchObject({ norm: "NEN-EN 1012", validity_months: 24, archived: 0 });
		expect(added.position).toBe(Math.max(...(await templatesOf(north.id)).map((t) => t.position)));
		expect(app.path()).toBe(`/checklists/templates/${added.id}`);
		expect(await templateActivity(added.id, since)).toMatchObject([
			{ action: "created", subject_label: "Compressor" },
		]);
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
		expect(await categoriesOf(added.id)).toEqual(["Compressor", "Pomp"]);

		await app.go("/checklists/templates");
		expect(await gaps().count()).toBe(0);
		expect(await templateRow("Compressor").innerText()).toContain("Pomp");
	});

	test("adds points in groups, each last in its group", async () => {
		await app.go(`/checklists/templates/${added.id}`);
		await addPoint("Smering", "Olie ververst");
		await addPoint("Veiligheid", "Drukschakelaar getest");
		// Through its group's own button, the group filled in.
		await pointsCard().getByRole("button", { name: "Add a point to Smering" }).click();
		expect(await dialog().getByLabel("Group").inputValue()).toBe("Smering");
		await dialog().getByLabel("Point", { exact: true }).fill("Filters vervangen");
		await app.submit(dialog().getByRole("button", { name: "Save point" }));
		await app.toast("Point saved");

		const expected = [
			"Smering:Olie ververst",
			"Smering:Filters vervangen",
			"Veiligheid:Drukschakelaar getest",
		];
		expect(await pointsOf(added.id)).toEqual(expected);
		await expect.poll(shownPoints).toEqual(expected);
		expect(await pointsCard().innerText()).toContain("3 points");
	});

	test("moves points within their group and into the next, and moves a group", async () => {
		const since = await lastActivityId();
		await move("Move point 2 up");
		await expect
			.poll(shownPoints)
			.toEqual([
				"Smering:Filters vervangen",
				"Smering:Olie ververst",
				"Veiligheid:Drukschakelaar getest",
			]);
		// The last of its group, down: the first of the next.
		await move("Move point 2 down");
		await expect
			.poll(shownPoints)
			.toEqual([
				"Smering:Filters vervangen",
				"Veiligheid:Olie ververst",
				"Veiligheid:Drukschakelaar getest",
			]);
		await move("Move group Veiligheid up");
		const expected = [
			"Veiligheid:Olie ververst",
			"Veiligheid:Drukschakelaar getest",
			"Smering:Filters vervangen",
		];
		await expect.poll(shownPoints).toEqual(expected);
		expect(await pointsOf(added.id)).toEqual(expected);
		expect((await pointRows(added.id)).map((point) => point.position)).toEqual([0, 1, 2]);
		expect(await page().getByRole("button", { name: "Move point 1 up" }).isDisabled()).toBe(true);
		expect(await page().getByRole("button", { name: "Move group Smering down" }).isDisabled()).toBe(
			true,
		);

		const entries = await templateActivity(added.id, since);
		expect(entries.map((entry) => [entry.action, entry.subject_type, entry.subject_label])).toEqual(
			[
				["updated", "checklistTemplateItem", "Filters vervangen"],
				["updated", "checklistTemplateItem", "Olie ververst"],
				["updated", "checklistTemplate", "Compressor"],
			],
		);
		expect(entries[0].parent_label).toBe("Compressor");
		expect(JSON.parse(entries[1].changes!)).toEqual({ group: ["Smering", "Veiligheid"] });
		expect(JSON.parse(entries[2].changes!)).toEqual({
			groups: [
				["Smering", "Veiligheid"],
				["Veiligheid", "Smering"],
			],
		});
	});

	test("edits a point into another group, and deletes one", async () => {
		await pointMenu(3, "Edit");
		expect(await dialog().getByLabel("Point", { exact: true }).inputValue()).toBe(
			"Filters vervangen",
		);
		await dialog().getByLabel("Group").fill("Veiligheid");
		await dialog().getByLabel("Point", { exact: true }).fill("Filters gereinigd");
		await app.submit(dialog().getByRole("button", { name: "Save point" }));
		await app.toast("Point saved");
		await expect
			.poll(shownPoints)
			.toEqual([
				"Veiligheid:Olie ververst",
				"Veiligheid:Drukschakelaar getest",
				"Veiligheid:Filters gereinigd",
			]);

		const since = await lastActivityId();
		await pointMenu(1, "Delete");
		await app.submit(alert().getByRole("button", { name: "Delete" }));
		await app.toast("Point deleted");
		const expected = ["Veiligheid:Drukschakelaar getest", "Veiligheid:Filters gereinigd"];
		await expect.poll(shownPoints).toEqual(expected);
		expect(await pointsOf(added.id)).toEqual(expected);
		expect(await templateActivity(added.id, since)).toMatchObject([
			{ action: "deleted", subject_label: "Olie ververst", parent_label: "Compressor" },
		]);
	});

	test("edits its details", async () => {
		const since = await lastActivityId();
		await page().getByRole("button", { name: "Edit", exact: true }).click();
		await dialog().getByLabel("Inspection valid for (months)").fill("6");
		await app.submit(dialog().getByRole("button", { name: "Save template" }));
		await app.toast("Template saved");
		await page().locator("[data-checklist-details]").getByText("6 months").waitFor();
		expect((await templateNamed(north.id, "Compressor")).validity_months).toBe(6);
		const [entry] = await templateActivity(added.id, since);
		expect(JSON.parse(entry.changes!)).toEqual({ validityMonths: [24, 6] });
	});

	test("retires it: kept with its points, its categories free, until it's restored", async () => {
		await page().getByRole("button", { name: "Retire" }).click();
		await app.submit(alert().getByRole("button", { name: "Retire" }));
		await app.toast("Template retired");
		await page().getByText("Retired", { exact: true }).waitFor();
		expect((await templateNamed(north.id, "Compressor")).archived).toBe(1);
		expect(await categoriesOf(added.id)).toEqual([]);
		expect(await pointsOf(added.id)).toHaveLength(2);
		// It isn't changed while it's retired.
		expect(await pointsCard().getByRole("button", { name: "Add point" }).count()).toBe(0);
		expect(await categoriesCard().getByRole("checkbox").count()).toBe(0);

		await app.go("/checklists/templates");
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

		await app.go(`/checklists/templates/${added.id}`);
		await app.submit(page().getByRole("button", { name: "Restore" }));
		await app.toast("Template restored");
		await pointsCard().getByRole("button", { name: "Add point" }).waitFor();
		expect((await templateNamed(north.id, "Compressor")).archived).toBe(0);
		expect((await templateActivity(added.id)).map((entry) => entry.action).slice(-2)).toEqual([
			"retired",
			"restored",
		]);
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
		await page().waitForURL((url) => url.pathname.startsWith("/checklists/templates/"));
		await page().getByRole("heading", { name: "Koelmachine" }).waitFor();
	});
});

describe("a member, in North", () => {
	test("sees the templates and their points, but can't change them", async () => {
		// The owner's forms, for the member to submit.
		const koelmachine = await templateNamed(north.id, "Koelmachine");
		await app.go(`/checklists/templates/${koelmachine.id}`);
		await page().getByRole("button", { name: "Edit", exact: true }).click();
		await dialog().getByLabel("Name").fill("Planner's own");
		const edit = await captureForm(dialog().locator("form"));
		await page().keyboard.press("Escape");
		const move = await captureForm(
			page().getByRole("button", { name: "Move point 1 down" }).locator("xpath=ancestor::form"),
		);
		const before = {
			templates: await templatesOf(north.id),
			points: await pointsOf(koelmachine.id),
		};

		await page().context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/checklists/templates");
		await templateRow("Koelmachine").waitFor();
		expect(await page().getByRole("button", { name: "Add template" }).count()).toBe(0);
		expect(await gaps().innerText()).toContain("Owners and admins change these.");

		await app.go(`/checklists/templates/${koelmachine.id}`);
		await pointsCard().getByText("Lekdichtheidscontrole uitgevoerd").waitFor();
		expect(await page().getByRole("button", { name: "Edit", exact: true }).count()).toBe(0);
		expect(await page().getByRole("button", { name: "Retire" }).count()).toBe(0);
		expect(await pointsCard().getByRole("button").count()).toBe(0);
		expect(await categoriesCard().getByRole("checkbox").count()).toBe(0);
		expect(await categoriesCard().innerText()).toContain("Koelmachine");

		expect(await post(edit)).toBe(403);
		expect(await post(move)).toBe(403);
		expect(await templatesOf(north.id)).toEqual(before.templates);
		expect(await pointsOf(koelmachine.id)).toEqual(before.points);
	});
});
