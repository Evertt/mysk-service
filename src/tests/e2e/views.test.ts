/**
 * Saved views of the data tables, on the customers list: saving the current filters and sorting
 * under a name, opening it again from the menu, updating it; and in South, the rename form with a
 * North view's id refused. What the views' remote functions refuse and log (names, sharing, who
 * sees and changes what, North's views and ids in South) is
 * `components/data-table/server/views.spec.ts`'s.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "./app.ts";

const { north, south } = organizations;
const admin = useApp();

const customersKey = "/(app)/customers";

interface SavedView {
	id: number;
	organization_id: string;
	name: string;
	query: string;
	shared: number;
	user_id: string;
}

/** The saved views of the customers list, by name. */
const views = (organizationId: string) =>
	rows<SavedView>(
		`select id, organization_id, name, query, shared, user_id from saved_view
		 where organization_id = ? and table_key = ? order by name`,
		[organizationId, customersKey],
	);

const viewNamed = async (name: string, organizationId: string) =>
	(await views(organizationId)).find((view) => view.name === name);

/** The activity logged about a saved view, oldest first. */
const viewActivity = (id: number) =>
	rows<{ action: string }>(
		`select action from activity where subject_type = 'saved_view' and subject_id = ? order by id`,
		[String(id)],
	);

const search = (page: Page) => new URL(page.url()).search;

/** The customers of an organization in some segments. */
const customersIn = (organizationId: string, ...segments: string[]) =>
	value<number>(
		`select count(*) from customer where organization_id = ? and segment in (${segments.map(() => "?").join(",")})`,
		[organizationId, ...segments],
	);

const menu = (page: Page) => page.getByRole("button", { name: /^Saved views/ });
const viewItem = (page: Page, name: string) =>
	page.getByRole("menuitemradio", { name: new RegExp(`^${name}`) });

/** Opens the menu and saves the current view as `name`; returns the server's answer. */
async function saveView(page: Page, name: string) {
	await menu(page).click();
	await page.getByRole("menuitem", { name: "Save current view…" }).click();
	await page.getByLabel("Name", { exact: true }).fill(name);
	return admin.submit(page.getByRole("button", { name: "Save", exact: true }));
}

/** Clicks one of the menu's actions for the current view. */
async function act(page: Page, action: string) {
	await menu(page).click();
	await page.getByRole("menuitem", { name: action }).click();
}

describe("in North", () => {
	const filtered = "?segment=enterprise,mid_market&sort=-open-orders";

	test("saving the current view keeps its filters and sorting, but not the position; it opens and updates", async () => {
		const { page } = admin;
		await admin.go(`/customers${filtered}&row=2`);
		expect(await menu(page).innerText()).toBe("Saved views");

		await saveView(page, "Big accounts");

		const [view] = await views(north.id);
		expect(view).toMatchObject({ name: "Big accounts", query: filtered, shared: 0 });
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Big accounts");
		// A personal view isn't the organization's business.
		expect(await viewActivity(view.id)).toEqual([]);

		// Opened from the menu, it restores its URL and rows, as a new history entry.
		await admin.go("/customers?segment=small_business");
		expect(await menu(page).innerText()).toBe("Saved views");

		await menu(page).click();
		await viewItem(page, "Big accounts").click();
		await page.waitForURL((url) => url.search === filtered);
		const big = await customersIn(north.id, "enterprise", "mid_market");
		await expect.poll(() => admin.rowCount()).toBe(big);
		expect(await menu(page).getAttribute("aria-label")).toBe("Saved views: Big accounts");

		await page.goBack();
		await page.waitForURL((url) => url.search === "?segment=small_business");
		const small = await customersIn(north.id, "small_business");
		await expect.poll(() => admin.rowCount()).toBe(small);

		// Updated with the table's current state.
		await menu(page).click();
		await viewItem(page, "Big accounts").click();
		await page.waitForURL((url) => url.search === filtered);

		await admin.openFilter("Segment");
		await page.getByRole("option", { name: /^Small business/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.searchParams.get("segment")?.split(",").length === 3);
		// Changed since it was opened: still the view, with unsaved changes.
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Big accounts, with unsaved changes");

		await act(page, "Update with the current view");
		await admin.toast("View updated");
		const updated = search(page);
		expect((await viewNamed("Big accounts", north.id))?.query).toBe(updated);
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Big accounts");
	});
});

describe("in South", () => {
	test("the rename form with the id of a North view is refused", async () => {
		const { page } = admin;
		const target = (await viewNamed("Big accounts", north.id))!;
		await admin.switchOrganization(south.name);
		await admin.go("/customers?segment=enterprise");
		await saveView(page, "Zuid groot");
		const own = (await viewNamed("Zuid groot", south.id))!;
		expect(own.organization_id).toBe(south.id);

		// Renaming, through the form's hidden id.
		await act(page, "Rename…");
		await page.getByLabel("Name", { exact: true }).fill("Tampered");
		const renamed = await admin.expectingErrors(async () => {
			await page.evaluate((id) => {
				document.querySelector<HTMLInputElement>('[role="dialog"] input[name^="id"]')!.value =
					String(id);
			}, target.id);
			return admin.submit(page.getByRole("button", { name: "Save", exact: true }));
		});
		expect(renamed).toMatch(/"status":404/);

		expect(await viewNamed("Big accounts", north.id)).toEqual(target);
		expect(await viewNamed("Zuid groot", south.id)).toEqual(own);
		await page.keyboard.press("Escape");
	});
});
