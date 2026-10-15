/**
 * The tables' memory (see `table-memory.svelte.ts`), on the orders list: the columns a user hides
 * stay hidden, for them alone and on any device; and the list comes back as they left it, with the
 * saved view they had open and its unsaved changes, unless a link says otherwise.
 */
import type { Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, users, quiet } from "./app.ts";
import { tamperWithCommand } from "./remote-functions.ts";

const { north, south } = organizations;
const admin = useApp();
const planner = useApp({ user: users.planner });

const ordersKey = "/(app)/orders";

interface Memory {
	columns: string | null;
	query: string;
	view_id: number | null;
}

/** What's remembered of the orders list for a user in an organization, if anything. */
const memoryOf = async (email: string, organizationId: string) =>
	(
		await rows<Memory>(
			`select m.columns, m.query, m.view_id from table_memory m join user u on u.id = m.user_id
			 where u.email = ? and m.organization_id = ? and m.table_key = ?`,
			[email, organizationId, ordersKey],
		)
	)[0];

const adminMemory = (organizationId: string) => memoryOf(users.admin, organizationId);

/** The column headers' names, as shown. */
const headers = (page: Page) =>
	page
		.locator("thead th")
		.evaluateAll((ths) => ths.map((th) => th.textContent!.replace(/\s+/g, " ").trim()));

const search = (page: Page) => new URL(page.url()).search;

const menu = (page: Page) => page.getByRole("button", { name: /^Saved views/ });

/** Shows or hides a column through the View menu. */
async function toggleColumn(page: Page, name: string) {
	await page.getByRole("button", { name: "View", exact: true }).click();
	await page.getByRole("menuitemcheckbox", { name }).click();
	await page.keyboard.press("Escape");
}

/** Goes to another list and back to the orders through the sidebar, as a user would. */
async function leaveAndComeBack(page: Page) {
	await page.getByRole("link", { name: "Customers", exact: true }).click();
	await page.waitForURL((url) => url.pathname === "/customers");
	await page.getByRole("link", { name: "Orders", exact: true }).click();
	await page.waitForURL((url) => url.pathname === "/orders");
	await quiet(page);
}

describe("in North", () => {
	test("a hidden column stays hidden after a reload", async () => {
		const { page } = admin;
		await admin.go("/orders");
		expect(await headers(page)).toContain("Total");

		await toggleColumn(page, "Total");
		await expect.poll(async () => (await adminMemory(north.id))?.columns).toMatch(/"total":false/);
		await page.reload();
		await quiet(page);
		expect(await headers(page)).not.toContain("Total");
		expect(await headers(page)).toContain("Engineer");
	});

	test("and on another device, but not for another user", async () => {
		const elsewhere = await admin.anotherTab();
		await elsewhere.goto(new URL("/orders", admin.page.url()).href);
		await quiet(elsewhere);
		expect(await headers(elsewhere)).not.toContain("Total");
		await elsewhere.context().close();

		await planner.go("/orders");
		expect(await headers(planner.page)).toContain("Total");
		expect(await memoryOf(users.planner, north.id)).toBeUndefined();
	});

	test("the list comes back as it was left, with the open view's unsaved changes", async () => {
		const { page } = admin;
		await admin.go("/orders?status=quote");
		await menu(page).click();
		await page.getByRole("menuitem", { name: "Save current view…" }).click();
		await page.getByLabel("Name", { exact: true }).fill("Quotes");
		await admin.submit(page.getByRole("button", { name: "Save", exact: true }));
		const [view] = await rows<{ id: number; columns: string }>(
			"select id, columns from saved_view where name = 'Quotes'",
		);
		// The view keeps the columns too.
		expect(JSON.parse(view.columns)).toMatchObject({ total: false, engineer: true });

		await admin.sortBy("Priority", "descending");
		await expect.poll(() => search(page)).toBe("?status=quote&sort=-priority");
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Quotes, with unsaved changes");
		await expect.poll(async () => (await adminMemory(north.id))?.view_id).toBe(view.id);

		await leaveAndComeBack(page);
		expect(search(page)).toBe("?status=quote&sort=-priority");
		await admin.tableSettled();
		// The menu loads on its own.
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Quotes, with unsaved changes");
		expect(await headers(page)).not.toContain("Total");

		// Also when the page is opened afresh.
		await admin.go("/orders");
		expect(search(page)).toBe("?status=quote&sort=-priority");
		await expect
			.poll(() => menu(page).getAttribute("aria-label"))
			.toBe("Saved views: Quotes, with unsaved changes");
	});

	test("a link with parameters wins", async () => {
		const { page } = admin;
		await admin.go("/orders?priority=urgent");
		await admin.tableSettled();
		expect(search(page)).toBe("?priority=urgent");
		// Once the menu has loaded (it's disabled until then): no view.
		await expect.poll(() => menu(page).isEnabled()).toBe(true);
		expect(await menu(page).getAttribute("aria-label")).toBeNull();
		// The columns still come back, and the list is now left like this.
		expect(await headers(page)).not.toContain("Total");
		await expect.poll(async () => (await adminMemory(north.id))?.query).toBe("?priority=urgent");
		await leaveAndComeBack(page);
		expect(search(page)).toBe("?priority=urgent");
	});

	test("No view goes back to the defaults, and forgets the list", async () => {
		const { page } = admin;
		await menu(page).click();
		await page.getByRole("menuitemradio", { name: /^Quotes/ }).click();
		await page.waitForURL((url) => url.search === "?status=quote");
		await menu(page).click();
		await page.getByRole("menuitem", { name: "No view" }).click();
		await page.waitForURL((url) => url.search === "");
		expect(await headers(page)).toContain("Total");
		await expect.poll(async () => await adminMemory(north.id)).toBeUndefined();

		await leaveAndComeBack(page);
		expect(search(page)).toBe("");
	});
});

describe("in South", () => {
	test("North's memory doesn't come back", async () => {
		const { page } = admin;
		await toggleColumn(page, "Total");
		await expect.poll(async () => (await adminMemory(north.id))?.columns).toMatch(/"total":false/);

		await admin.switchOrganization(south.name);
		await admin.go("/orders");
		expect(search(page)).toBe("");
		expect(await headers(page)).toContain("Total");
	});

	test("a North view can't be remembered as open by a tampered id", async () => {
		const { page } = admin;
		const [northView] = await rows<{ id: number }>(
			"select id from saved_view where organization_id = ? and name = 'Quotes'",
			[north.id],
		);
		await tamperWithCommand<{ viewId: number | null }>(page, "rememberTable", (arg) => ({
			...arg,
			viewId: northView.id,
		}));
		await admin.go("/orders?status=completed");
		await admin.tableSettled();
		await expect.poll(async () => (await adminMemory(south.id))?.query).toBe("?status=completed");
		expect((await adminMemory(south.id))?.view_id).toBeNull();
		// North's is as it was.
		expect((await adminMemory(north.id))?.columns).toMatch(/"total":false/);
	});
});
