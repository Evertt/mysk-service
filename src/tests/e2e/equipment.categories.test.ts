/**
 * The tenant's equipment categories on their settings page: managers add, rename, reorder and
 * delete them; members and engineers can't; South can't touch North's.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const page = () => app.page;
const categoryRow = (name: string) => page().locator(`tr[data-category="${name}"]`);

interface Category {
	id: number;
	name: string;
	specialty: string | null;
	position: number;
}

/** An organization's categories, in its order. */
const categoriesOf = (organizationId: string) =>
	rows<Category>(
		`select id, name, specialty, position from equipment_category
		 where organization_id = ? order by position, id`,
		[organizationId],
	);

/** The names the settings page shows, in order. */
const shownNames = () =>
	page()
		.locator("tr[data-category]")
		.evaluateAll((trs: HTMLElement[]) => trs.map((tr) => tr.dataset.category!));

/** What was logged about an organization's category, oldest first. */
const logged = (organizationId: string, id: number) =>
	rows<{ action: string; subject_label: string; changes: string | null }>(
		`select action, subject_label, changes from activity
		 where organization_id = ? and subject_type = 'equipment_category' and subject_id = ?
		 order by id`,
		[organizationId, String(id)],
	);

const dialog = () => page().getByRole("dialog");

/** Opens the add dialog, or a category's edit dialog, and fills it in. */
async function fillDialog(fields: { name?: string; specialty?: string }, of?: string) {
	if (of) {
		await categoryRow(of)
			.getByRole("button", { name: `Actions for ${of}` })
			.click();
		await page().getByRole("menuitem", { name: "Edit" }).click();
	} else {
		await page().getByRole("button", { name: "Add category" }).click();
	}
	if (fields.name !== undefined) await dialog().getByLabel("Name").fill(fields.name);
	if (fields.specialty !== undefined) {
		await dialog().getByLabel("Serviced by").selectOption({ label: fields.specialty });
	}
}

const save = () => app.submit(dialog().getByRole("button", { name: "Save category" }));

/** Opens a category's delete dialog and confirms it. */
async function remove(name: string) {
	await categoryRow(name)
		.getByRole("button", { name: `Actions for ${name}` })
		.click();
	await page().getByRole("menuitem", { name: "Delete" }).click();
	return app.submit(page().getByRole("alertdialog").getByRole("button", { name: "Delete" }));
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
	test("finds the categories from the settings, in North's order with their equipment", async () => {
		await app.go("/settings");
		const summary = page().getByTestId("equipment-categories-summary");
		const names = (await categoriesOf(north.id)).map((category) => category.name);
		expect((await summary.innerText()).replace(/\s+/g, " ")).toContain(names.join(" "));
		await summary.getByRole("link", { name: "Manage categories" }).click();
		await page().waitForURL((url) => url.pathname === "/settings/equipment-categories");
		await page().getByRole("heading", { name: "Equipment categories" }).first().waitFor();
		expect(await shownNames()).toEqual(names);
		const units = await value<number>(
			`select count(*) from equipment e join equipment_category c on c.id = e.category_id
			 where c.organization_id = ? and c.name = 'Koelmachine'`,
			[north.id],
		);
		expect(await categoryRow("Koelmachine").innerText()).toContain(`${units} units`);
		expect(await categoryRow("Koelmachine").innerText()).toContain("HVAC");
	});

	test("adds one, last, with a name North doesn't have yet in any case", async () => {
		const before = await categoriesOf(north.id);
		await fillDialog({ name: "  koelmachine ", specialty: "Mechanical" });
		await save();
		expect(await app.issues()).toContain("There's a category Koelmachine already");
		expect(await categoriesOf(north.id)).toEqual(before);

		await dialog().getByLabel("Name").fill("Sectionaaldeur");
		await save();
		await app.toast("Category saved");
		await categoryRow("Sectionaaldeur").waitFor();
		const after = await categoriesOf(north.id);
		expect(after.slice(0, -1)).toEqual(before);
		expect(after.at(-1)).toMatchObject({
			name: "Sectionaaldeur",
			specialty: "mechanical",
			position: Math.max(...before.map((category) => category.position)) + 1,
		});
		expect(await shownNames()).toEqual(after.map((category) => category.name));
		expect(await logged(north.id, after.at(-1)!.id)).toMatchObject([
			{ action: "created", subject_label: "Sectionaaldeur" },
		]);
	});

	test("renames it and takes its specialty away", async () => {
		const [added] = (await categoriesOf(north.id)).filter((c) => c.name === "Sectionaaldeur");
		await fillDialog({ name: "Overheaddeur", specialty: "No specialty" }, "Sectionaaldeur");
		await save();
		await app.toast("Category saved");
		await categoryRow("Overheaddeur").waitFor();
		const [renamed] = await rows<Category>(`select * from equipment_category where id = ?`, [
			added.id,
		]);
		expect(renamed).toMatchObject({ name: "Overheaddeur", specialty: null });
		expect((await categoryRow("Overheaddeur").innerText()).replace(/\s+/g, " ")).toContain(
			"Overheaddeur — 0 units",
		);
		const [, updated] = await logged(north.id, added.id);
		expect(updated).toMatchObject({ action: "updated", subject_label: "Overheaddeur" });
		expect(JSON.parse(updated.changes!)).toEqual({
			name: ["Sectionaaldeur", "Overheaddeur"],
			specialty: ["mechanical", null],
		});
	});

	test("moves it up the order, past the one before it", async () => {
		const before = await categoriesOf(north.id);
		const [last, previous] = before.toReversed();
		expect(last.name).toBe("Overheaddeur");
		await app.submit(page().getByRole("button", { name: "Move Overheaddeur up" }));
		const expected = [...before.slice(0, -2), last, previous].map((category) => category.name);
		await expect.poll(shownNames).toEqual(expected);
		expect((await categoriesOf(north.id)).map((category) => category.name)).toEqual(expected);
		expect(await logged(north.id, last.id)).toHaveLength(3);
		// The first can't move up, nor the last down.
		const [first] = expected;
		expect(
			await page()
				.getByRole("button", { name: `Move ${first} up` })
				.isDisabled(),
		).toBe(true);
		expect(
			await page()
				.getByRole("button", { name: `Move ${previous.name} down` })
				.isDisabled(),
		).toBe(true);
	});

	test("the equipment form and the list's filter offer North's categories in their order", async () => {
		const names = (await categoriesOf(north.id)).map((category) => category.name);
		await app.go("/equipment/new");
		const options = await page().getByLabel("Category").locator("option").allInnerTexts();
		expect(options.slice(1)).toEqual(names);

		await app.go("/equipment");
		await app.openFilter("Category");
		const offered = await page().getByRole("option").allInnerTexts();
		expect(offered.map((text) => text.trim().replace(/\s*\d+$/, ""))).toEqual(names);
		await page().keyboard.press("Escape");
	});

	test("deleting a category that equipment has is refused, saying why", async () => {
		await app.go("/settings/equipment-categories");
		const before = await categoriesOf(north.id);
		const units = await value<number>(
			`select count(*) from equipment e join equipment_category c on c.id = e.category_id
			 where c.organization_id = ? and c.name = 'Koelmachine'`,
			[north.id],
		);
		await remove("Koelmachine");
		expect(await app.issues()).toContain(
			`Koelmachine can't be deleted while ${units} units have it. Give them another category first.`,
		);
		expect(await categoriesOf(north.id)).toEqual(before);
		await page().getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
	});

	test("deletes one that no equipment has", async () => {
		const [unused] = (await categoriesOf(north.id)).filter((c) => c.name === "Overheaddeur");
		await remove("Overheaddeur");
		await app.toast("Category deleted");
		await expect.poll(() => categoryRow("Overheaddeur").count()).toBe(0);
		expect((await categoriesOf(north.id)).map((category) => category.id)).not.toContain(unused.id);
		expect((await logged(north.id, unused.id)).at(-1)).toMatchObject({ action: "deleted" });
	});
});

describe("someone who isn't an owner or admin", () => {
	test("a member sees the categories but can't reach their page, nor change them", async () => {
		// The add form as the owner has it, for the member to submit (not saved here).
		await app.go("/settings/equipment-categories");
		await fillDialog({ name: "Planner's own" });
		const add = await captureForm(dialog().locator("form"));
		expect(add.fields).toContainEqual([expect.stringMatching(/^name/), "Planner's own"]);
		const before = await categoriesOf(north.id);

		await page().context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/settings");
		const summary = page().getByTestId("equipment-categories-summary");
		expect(await summary.innerText()).toContain("Koelmachine");
		expect(await summary.getByRole("link", { name: "Manage categories" }).count()).toBe(0);
		const response = await app.expectingErrors(() => app.go("/settings/equipment-categories"));
		expect(response?.status()).toBe(403);
		expect(await post(add)).toBe(403);
		expect(await categoriesOf(north.id)).toEqual(before);
	});

	test("a field engineer is sent to the portal", async () => {
		await page().context().clearCookies();
		await app.signIn(users.engineer);
		await app.go("/settings/equipment-categories");
		expect(app.path()).toBe("/my");
	});
});

describe("South", () => {
	test("sees its own categories only", async () => {
		await page().context().clearCookies();
		await app.signIn(users.admin);
		await app.switchOrganization(south.name);
		await app.go("/settings/equipment-categories");
		expect(await shownNames()).toEqual((await categoriesOf(south.id)).map((c) => c.name));
	});

	test("can't rename or delete North's, by tampering with the id", async () => {
		const [own] = await categoriesOf(south.id);
		const [target] = await categoriesOf(north.id);
		const northBefore = await categoriesOf(north.id);
		const southBefore = await categoriesOf(south.id);
		const tamper = (scope: ReturnType<Page["locator"]>) =>
			scope
				.locator('input[type="hidden"][name^="id"]')
				.evaluate((input: HTMLInputElement, id) => (input.value = String(id)), target.id);

		await fillDialog({ name: "Overgenomen" }, own.name);
		const renamed = await app.expectingErrors(async () => {
			await tamper(dialog());
			return save();
		});
		expect(renamed).toMatch(/"status":404/);
		await dialog().getByRole("button", { name: "Cancel" }).click();

		await categoryRow(own.name)
			.getByRole("button", { name: `Actions for ${own.name}` })
			.click();
		await page().getByRole("menuitem", { name: "Delete" }).click();
		const alert = page().getByRole("alertdialog");
		const deleted = await app.expectingErrors(async () => {
			await tamper(alert);
			return app.submit(alert.getByRole("button", { name: "Delete" }));
		});
		expect(deleted).toMatch(/"status":404/);

		expect(await categoriesOf(north.id)).toEqual(northBefore);
		expect(await categoriesOf(south.id)).toEqual(southBefore);
	});
});
