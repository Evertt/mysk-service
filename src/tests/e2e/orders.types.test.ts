/**
 * The order types as a tenant sets them up on the settings page: a name of its own in each
 * language, shown wherever a type is (the list and its filter, an order's page and form, the
 * activity log), and hiding the types it doesn't use from the order form (an order that has one
 * keeps it). What's refused (a name another type has, hiding a type a module needs) and that the
 * settings keep to the tenant are `orders/server/types.spec.ts`'s; a hidden type for an order
 * that hasn't got it, and a member's change, `orders/server/changes.spec.ts`'s. The file puts
 * North's types back as standard at its end.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";

const { north } = organizations;
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
			"Needed by Work orders, Maintenance plans",
		);
		expect(await typeRow("breakdown").innerText()).toContain("Needed by Customer portal");
		expect(await typeRow("project").innerText()).not.toContain("Needed by");
	});

	test("renames a type in both languages and hides it from the order form, and logs it", async () => {
		await edit("Project", { en: "Job", nl: " Klus " });
		await hide(true);
		await save();
		await app.toast("Order type saved");
		await page().getByRole("button", { name: "Edit Job", exact: true }).waitFor();
		expect(await typeRow("project").locator('[data-locale="nl"]').innerText()).toBe("Klus");
		await expect.poll(() => typeRow("project").innerText()).toContain("Hidden");
		expect(await settingsOf(north.id)).toEqual([
			{ type: "project", names: JSON.stringify({ en: "Job", nl: "Klus" }), hidden: 1 },
		]);
		const [entry] = await rows<{ action: string; changes: string }>(
			`select action, changes from activity
			 where organization_id = ? and subject_type = 'order_type' and subject_id = 'project'`,
			[north.id],
		);
		expect(entry.action).toBe("updated");
		expect(JSON.parse(entry.changes)).toEqual({
			name_en: [null, "Job"],
			name_nl: [null, "Klus"],
			hidden: [false, true],
		});

		await app.go("/activity");
		expect(await page().locator("main").innerText()).toContain("updated order type Job");
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

	test("an order that has it shows it, on its page and its form; a new order can't have it", async () => {
		const options = await typeOptions("/orders/new");
		expect(options).not.toContain("Job");
		expect(options).not.toContain("Project");

		const kept = await openOrder("project");
		await app.go(`/orders/${kept}`);
		expect(await page().locator("main").innerText()).toContain("Job");
		const own = await typeOptions(`/orders/${kept}/edit`);
		expect(own).toContain("Job");
		expect(own).not.toContain("Project");
		expect(await page().getByLabel("Type").inputValue()).toBe("project");
		expect(await typeOptions(`/orders/${await openOrder("repair")}/edit`)).not.toContain("Job");
	});
});

describe("North, afterwards", () => {
	test("puts its types back as standard, which leaves no settings", async () => {
		await app.go("/settings/order-types");
		await edit("Job", { en: "", nl: "" });
		await hide(false);
		await save();
		await app.toast("Order type saved");
		expect(await settingsOf(north.id)).toEqual([]);
		expect(await typeOptions("/orders/new")).toContain("Project");
	});
});
