/**
 * Saved views of the data tables, on the customers list: saving the current filters and sorting
 * under a name, opening them again, changing, sharing and deleting them, and who sees what.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, userNames, users, value } from "./app.ts";
import { isRemote, tamperWithCommand } from "./remote-functions.ts";

const { north, south } = organizations;
const admin = useApp();
const planner = useApp({ user: users.planner });

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
	rows<{ action: string; subject_label: string }>(
		`select action, subject_label from activity where subject_type = 'saved_view' and subject_id = ?
		 order by id`,
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
async function saveView(page: Page, name: string, { share = false } = {}) {
	await menu(page).click();
	await page.getByRole("menuitem", { name: "Save current view…" }).click();
	await page.getByLabel("Name", { exact: true }).fill(name);
	if (share) await page.getByLabel("Share with the organization").check();
	return admin.page === page
		? admin.submit(page.getByRole("button", { name: "Save", exact: true }))
		: planner.submit(page.getByRole("button", { name: "Save", exact: true }));
}

/** Clicks one of the menu's actions for the current view. */
async function act(page: Page, action: string) {
	await menu(page).click();
	await page.getByRole("menuitem", { name: action }).click();
}

describe("in North", () => {
	const filtered = "?segment=enterprise,mid_market&sort=-open-orders";

	test("saving the current view keeps its filters and sorting, but not the position", async () => {
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
	});

	test("a name the user already has for the table is refused", async () => {
		const { page } = admin;
		await saveView(page, "big accounts");
		expect(await admin.issues()).toEqual(["You already have a view called “big accounts” here"]);
		expect(await views(north.id)).toHaveLength(1);
		await page.keyboard.press("Escape");
	});

	test("opening a view restores its URL and rows, as a new history entry", async () => {
		const { page } = admin;
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
	});

	test("a view can be updated with the table's current state", async () => {
		const { page } = admin;
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

	test("a view can be renamed", async () => {
		const { page } = admin;
		await act(page, "Rename…");
		await page.getByLabel("Name", { exact: true }).fill("Every segment");
		await admin.submit(page.getByRole("button", { name: "Save", exact: true }));
		expect((await views(north.id)).map((view) => view.name)).toEqual(["Every segment"]);
	});

	test("an owner shares a view with the organization, which is logged", async () => {
		const { page } = admin;
		await act(page, "Share with the organization");
		await admin.toast("View shared with the organization");
		const view = (await viewNamed("Every segment", north.id))!;
		expect(view.shared).toBe(1);
		expect(await viewActivity(view.id)).toEqual([
			{ action: "shared", subject_label: "Every segment" },
		]);

		await admin.go(`/customers${filtered}`);
		await saveView(page, "Shared from the start", { share: true });
		const created = (await viewNamed("Shared from the start", north.id))!;
		expect(created.shared).toBe(1);
		expect(await viewActivity(created.id)).toEqual([
			{ action: "created", subject_label: "Shared from the start" },
		]);
	});

	test("the planner sees the shared views and opens them, but can't change them", async () => {
		const { page } = planner;
		await planner.go("/customers");
		await menu(page).click();
		const item = viewItem(page, "Every segment");
		expect(await item.innerText()).toContain(`Shared by ${userNames.admin}`);
		await item.click();
		const { query } = (await viewNamed("Every segment", north.id))!;
		await page.waitForURL((url) => url.search === query);
		await menu(page).click();
		expect(await page.getByRole("menuitem", { name: "Rename…" }).count()).toBe(0);
		expect(await page.getByRole("menuitem", { name: "Delete…" }).count()).toBe(0);
		expect(await page.getByRole("menuitem", { name: "Share with the organization" }).count()).toBe(
			0,
		);
		await page.keyboard.press("Escape");
	});

	test("the planner's own views are theirs alone, and they can't share them", async () => {
		const { page } = planner;
		await planner.go("/customers?segment=small_business");
		await menu(page).click();
		await page.getByRole("menuitem", { name: "Save current view…" }).click();
		expect(await page.getByLabel("Share with the organization").count()).toBe(0);
		await page.getByLabel("Name", { exact: true }).fill("Small ones");
		await planner.submit(page.getByRole("button", { name: "Save", exact: true }));
		const own = (await viewNamed("Small ones", north.id))!;
		expect(own.shared).toBe(0);

		await admin.go("/customers");
		await menu(admin.page).click();
		expect(await viewItem(admin.page, "Small ones").count()).toBe(0);
		await admin.page.keyboard.press("Escape");
	});

	test("the planner can't delete a shared view by a tampered id", async () => {
		const { page } = planner;
		const own = (await viewNamed("Small ones", north.id))!;
		const shared = (await viewNamed("Every segment", north.id))!;
		await planner.expectingErrors(async () => {
			await tamperWithCommand<number>(page, "deleteView", () => shared.id);
			await act(page, "Delete…");
			const [response] = await Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "deleteView")),
				page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click(),
			]);
			expect(await response.text()).toMatch(/"status":403/);
		});
		expect(await viewNamed("Every segment", north.id)).toEqual(shared);
		expect(await viewNamed("Small ones", north.id)).toEqual(own);
		await page.keyboard.press("Escape");
	});

	test("deleting asks first; a shared view's deletion is logged", async () => {
		const { page } = admin;
		await admin.go("/customers");
		await menu(page).click();
		await viewItem(page, "Every segment").click();
		const view = (await viewNamed("Every segment", north.id))!;

		await act(page, "Stop sharing");
		await admin.toast("View no longer shared");
		expect((await viewNamed("Every segment", north.id))?.shared).toBe(0);

		await act(page, "Delete…");
		const dialog = page.getByRole("alertdialog");
		expect(await dialog.innerText()).toContain("Only you can see this view.");
		await dialog.getByRole("button", { name: "Cancel" }).click();
		expect(await viewNamed("Every segment", north.id)).toBeDefined();

		const created = (await viewNamed("Shared from the start", north.id))!;
		await menu(page).click();
		await viewItem(page, "Shared from the start").click();
		await act(page, "Delete…");
		expect(await dialog.innerText()).toContain("Everyone in the organization loses this view.");
		await dialog.getByRole("button", { name: "Delete" }).click();
		await admin.toast("View deleted");
		expect(await viewNamed("Shared from the start", north.id)).toBeUndefined();
		expect((await viewActivity(created.id)).map((entry) => entry.action)).toEqual([
			"created",
			"deleted",
		]);
		expect((await viewActivity(view.id)).map((entry) => entry.action)).toEqual([
			"shared",
			"unshared",
		]);
	});
});

describe("in South", () => {
	test("North's views don't show", async () => {
		const { page } = admin;
		await admin.switchOrganization(south.name);
		await admin.go("/customers");
		await menu(page).click();
		await expect.poll(() => page.getByText("No saved views yet.").count()).toBe(1);
		await page.keyboard.press("Escape");
	});

	test("North's views can't be renamed, updated or deleted by a tampered id", async () => {
		const { page } = admin;
		const target = (await viewNamed("Every segment", north.id))!;
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

		// Updating and deleting, through the commands' arguments: from the view, changed.
		await admin.go("/customers");
		await menu(page).click();
		await viewItem(page, "Zuid groot").click();
		await page.waitForURL((url) => url.search === "?segment=enterprise");
		await admin.openFilter("Segment");
		await page.getByRole("option", { name: /^Mid-market/ }).click();
		await page.keyboard.press("Escape");
		await page.waitForURL((url) => url.search === "?segment=enterprise,mid_market");
		await admin.expectingErrors(async () => {
			await tamperWithCommand<{ id: number }>(page, "updateView", (arg) => ({
				...arg,
				id: target.id,
			}));
			const [update] = await Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "updateView")),
				act(page, "Update with the current view"),
			]);
			expect(await update.text()).toMatch(/"status":404/);

			await tamperWithCommand<number>(page, "deleteView", () => target.id);
			await act(page, "Delete…");
			const [remove] = await Promise.all([
				page.waitForResponse((r) => isRemote(r.url(), "deleteView")),
				page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click(),
			]);
			expect(await remove.text()).toMatch(/"status":404/);
		});

		expect(await viewNamed("Every segment", north.id)).toEqual(target);
		expect(await viewNamed("Zuid groot", south.id)).toEqual(own);
		await page.keyboard.press("Escape");
	});
});
