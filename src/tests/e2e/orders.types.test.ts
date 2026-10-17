/**
 * The order types as a tenant sets them up on the settings page: a name of its own in each
 * language, shown wherever a type is (the list and its filter, the form, an order's page, the
 * schedule, the activity log), and hiding the types it doesn't use from the order form (an order
 * that has one keeps it). A type a module needs can't be hidden; members can't change them; South
 * keeps the standard names. The file puts North's types back as standard at its end.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users, value } from "./app.ts";

const { north, south } = organizations;
const app = useApp();

const page = () => app.page;
const typeRow = (type: string) => page().locator(`tr[data-order-type="${type}"]`);
const dialog = () => page().getByRole("dialog");

interface Setting {
	type: string;
	names: string;
	hidden: number;
}

/** An organization's stored settings, by type. */
const settingsOf = (organizationId: string) =>
	rows<Setting>(
		`select type, names, hidden from order_type_setting where organization_id = ? order by type`,
		[organizationId],
	);

/** Opens a type's dialog (by the name it has now) and fills in its names. */
async function edit(name: string, names: { en?: string; nl?: string } = {}) {
	await page()
		.getByRole("button", { name: `Edit ${name}`, exact: true })
		.click();
	if (names.en !== undefined) await dialog().getByLabel("English").fill(names.en);
	if (names.nl !== undefined) await dialog().getByLabel("Nederlands").fill(names.nl);
}

const hide = (hidden: boolean) =>
	dialog().getByRole("checkbox", { name: "Hide from the order form" }).setChecked(hidden);

const save = () => app.submit(dialog().getByRole("button", { name: "Save" }));

/** The type select's options on the order form at `path`. */
async function typeOptions(path: string) {
	await app.go(path);
	return page().getByLabel("Type").locator("option").allInnerTexts();
}

/** An order of North's of `type` that can still be edited. */
const openOrder = (type: string) =>
	value<string>(
		`select number from "order" where organization_id = ? and type = ?
		 and status in ('quote', 'scheduled', 'in_progress') order by id limit 1`,
		[north.id, type],
	);

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
	test("finds the types from the settings, with what needs them", async () => {
		await app.go("/settings");
		const summary = page().getByTestId("order-types-summary");
		expect((await summary.innerText()).replace(/\s+/g, " ")).toContain(
			"Breakdown Repair Maintenance Inspection Installation Survey Damage Project Other",
		);
		await summary.getByRole("link", { name: "Manage types" }).click();
		await page().waitForURL((url) => url.pathname === "/settings/order-types");
		await typeRow("project").waitFor();
		expect(await page().locator("tr[data-order-type]").count()).toBe(9);
		expect(await typeRow("inspection").innerText()).toContain(
			"Needed by Checklists, Maintenance plans",
		);
		expect(await typeRow("breakdown").innerText()).toContain("Needed by Customer portal");
		expect(await typeRow("project").innerText()).not.toContain("Needed by");
	});

	test("renames a type in both languages, and logs it", async () => {
		await edit("Project", { en: "Job", nl: " Klus " });
		await save();
		await app.toast("Order type saved");
		await page().getByRole("button", { name: "Edit Job", exact: true }).waitFor();
		expect(await typeRow("project").locator('[data-locale="nl"]').innerText()).toBe("Klus");
		expect(await settingsOf(north.id)).toEqual([
			{ type: "project", names: JSON.stringify({ en: "Job", nl: "Klus" }), hidden: 0 },
		]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity
			 where organization_id = ? and subject_type = 'order_type' and subject_id = 'project'`,
			[north.id],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({ name_en: [null, "Job"], name_nl: [null, "Klus"] });

		await app.go("/activity");
		expect(await page().locator("main").innerText()).toContain("updated order type Job");
	});

	test("refuses a name another type has", async () => {
		await app.go("/settings/order-types");
		await edit("Other", { en: "repair" });
		await save();
		expect(await app.issues()).toContain("Another type is already called repair");
		expect((await settingsOf(north.id)).map((setting) => setting.type)).toEqual(["project"]);
		await dialog().getByRole("button", { name: "Cancel" }).click();
	});

	test("the list shows the name, and filters by it, with the type's id in the URL", async () => {
		await app.go("/orders?type=project");
		const shown = await page().locator("tbody tr").first().innerText();
		expect(shown).toContain("Job");
		expect(shown).not.toContain("Project");
		expect(new URL(page().url()).searchParams.get("type")).toBe("project");
		await app.openFilter("Type");
		const offered = (await page().getByRole("option").allInnerTexts()).map((text) =>
			text.trim().replace(/\s*[\d,]+$/, ""),
		);
		expect(offered).toContain("Job");
		expect(offered).not.toContain("Project");
		await page().keyboard.press("Escape");
	});

	test("the form, an order's page and the schedule show it too", async () => {
		const options = await typeOptions("/orders/new");
		expect(options).toContain("Job");
		expect(options).not.toContain("Project");

		const number = await value<string>(
			`select number from "order" where organization_id = ? and type = 'project' order by id limit 1`,
			[north.id],
		);
		await app.go(`/orders/${number}`);
		expect(await page().locator("main").innerText()).toContain("Job");

		await app.go("/schedule?view=month");
		const legend = await page()
			.getByRole("list", { name: "Order types" })
			.getByRole("listitem")
			.allInnerTexts();
		expect(legend).toContain("Job");
		expect(legend).not.toContain("Project");
	});

	test("hides a type from the order form; an order that has it keeps it", async () => {
		await app.go("/settings/order-types");
		await edit("Installation");
		await hide(true);
		await save();
		await app.toast("Order type saved");
		await expect.poll(() => typeRow("installation").innerText()).toContain("Hidden");
		expect((await settingsOf(north.id)).find((setting) => setting.type === "installation")).toEqual(
			{
				type: "installation",
				names: "{}",
				hidden: 1,
			},
		);

		expect(await typeOptions("/orders/new")).not.toContain("Installation");
		const kept = await openOrder("installation");
		await app.go(`/orders/${kept}`);
		expect(await page().locator("main").innerText()).toContain("Installation");
		const options = await typeOptions(`/orders/${kept}/edit`);
		expect(options).toContain("Installation");
		expect(await page().getByLabel("Type").inputValue()).toBe("installation");
		expect(await typeOptions(`/orders/${await openOrder("repair")}/edit`)).not.toContain(
			"Installation",
		);
	});

	test("the server refuses a hidden type for an order that hasn't got it", async () => {
		const number = await openOrder("repair");
		await app.go(`/orders/${number}/edit`);
		await page()
			.getByLabel("Type")
			.evaluate((select: HTMLSelectElement) => {
				select.add(new Option("Installation", "installation"));
				select.value = "installation";
				select.dispatchEvent(new Event("change", { bubbles: true }));
			});
		await app.submit(page().getByRole("button", { name: "Save order" }));
		expect(await app.issues()).toContain("This type is hidden: choose another one");
		expect(
			await value(`select type from "order" where organization_id = ? and number = ?`, [
				north.id,
				number,
			]),
		).toBe("repair");
	});

	test("can't hide a type a module that's on needs, and says which", async () => {
		await app.go("/settings/order-types");
		await edit("Inspection");
		expect(await dialog().innerText()).toContain("Needed by Checklists, Maintenance plans");
		await hide(true);
		await save();
		expect(await app.issues()).toContain(
			"Can't be hidden: needed by Checklists, Maintenance plans",
		);
		await dialog().getByRole("button", { name: "Cancel" }).click();

		await edit("Breakdown");
		await hide(true);
		await save();
		expect(await app.issues()).toContain("Can't be hidden: needed by Customer portal");
		await dialog().getByRole("button", { name: "Cancel" }).click();
		expect((await settingsOf(north.id)).map((setting) => setting.type)).toEqual([
			"installation",
			"project",
		]);
	});
});

describe("someone who isn't an owner or admin", () => {
	test("a member sees North's names but can't reach the page, nor change them", async () => {
		await app.go("/settings/order-types");
		await edit("Job", { en: "Planner's own" });
		const form = await captureForm(dialog().locator("form"));
		expect(form.fields).toContainEqual([expect.stringMatching(/^names\.en/), "Planner's own"]);
		const before = await settingsOf(north.id);

		await page().context().clearCookies();
		await app.signIn(users.planner);
		await app.go("/settings");
		const summary = page().getByTestId("order-types-summary");
		expect(await summary.innerText()).toContain("Job");
		expect(await summary.getByRole("link", { name: "Manage types" }).count()).toBe(0);
		const response = await app.expectingErrors(() => app.go("/settings/order-types"));
		expect(response?.status()).toBe(403);
		expect(await post(form)).toBe(403);
		expect(await settingsOf(north.id)).toEqual(before);
		// The office's member reads the tenant's names, also on the order form.
		const options = await typeOptions("/orders/new");
		expect(options).toContain("Job");
		expect(options).not.toContain("Installation");
	});
});

describe("South", () => {
	test("keeps the standard names and types, and sets up its own", async () => {
		await page().context().clearCookies();
		await app.signIn(users.admin);
		await app.switchOrganization(south.name);
		const options = await typeOptions("/orders/new");
		expect(options).toContain("Project");
		expect(options).toContain("Other");
		expect(options).not.toContain("Job");

		await app.go("/settings/order-types");
		expect(await typeRow("project").locator('[data-locale="en"]').innerText()).toBe("Project");
		expect(await typeRow("other").innerText()).toContain("Shown");
		await edit("Survey", { en: "Site visit" });
		await save();
		await app.toast("Order type saved");
		expect(await settingsOf(south.id)).toEqual([
			{ type: "survey", names: JSON.stringify({ en: "Site visit" }), hidden: 0 },
		]);
		// North's are as they were.
		expect((await settingsOf(north.id)).map((setting) => setting.type)).toEqual([
			"installation",
			"project",
		]);
		// And back to standard, which leaves no row.
		await edit("Site visit", { en: "" });
		await save();
		await app.toast("Order type saved");
		expect(await settingsOf(south.id)).toEqual([]);
	});
});

describe("North, afterwards", () => {
	test("puts its types back as standard, which leaves no settings", async () => {
		await app.switchOrganization(north.name);
		await app.go("/settings/order-types");
		await edit("Job", { en: "", nl: "" });
		await save();
		await app.toast("Order type saved");
		await edit("Installation");
		await hide(false);
		await save();
		await app.toast("Order type saved");
		expect(await settingsOf(north.id)).toEqual([]);
		expect(await typeOptions("/orders/new")).toEqual(
			expect.arrayContaining(["Project", "Installation"]),
		);
	});
});
