import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { hydrated, organizations, rows, useApp, value } from "./app.ts";

const { north } = organizations;
const app = useApp();

/** The feed's entries, as text. */
async function feedEntries() {
	const texts = await app.page
		.getByRole("list", { name: "Activity log", exact: true })
		.locator(":scope > li")
		.allInnerTexts();
	return texts.map((text) => text.replace(/\s+/g, " "));
}

/** The "N new entries" notice of a page past the first. */
const notice = () => app.page.locator('[data-slot="new-activity"]');

/** Changes a customer's city through its form, in a page of its own. */
async function moveCustomer(code: string, city: string) {
	const other: Page = await app.anotherTab();
	try {
		await other.goto(new URL(`/customers/${code}/edit`, app.page.url()).href);
		await hydrated(other);
		await other.getByLabel("City").fill(city);
		await other.getByRole("button", { name: "Save customer" }).click();
		await other.waitForURL((url) => url.pathname === `/customers/${code}`);
	} finally {
		await other.context().close();
	}
	const saved = await rows<{ city: string }>(
		`select city from customer where code = ? and organization_id = ?`,
		[code, north.id],
	);
	expect(saved).toEqual([{ city }]);
}

test("the feed's first page shows a change another user makes, without reloading", async () => {
	const { page } = app;
	await app.go("/activity");
	await page.evaluate(() => Object.assign(window, { feedMarker: true }));

	await moveCustomer("CUST-0003", "Livetown");

	await expect
		.poll(async () => (await feedEntries())[0])
		.toMatch(/updated customer CUST-0003 city: .+ → Livetown/);
	expect(await notice().count()).toBe(0);
	expect(await page.evaluate(() => "feedMarker" in window)).toBe(true);
});

test("a page past the first keeps its entries, and says how many new ones came in", async () => {
	const { page } = app;
	const newest = await value<number>(`select max(id) from activity where organization_id = ?`, [
		north.id,
	]);
	await app.go(`/activity?before=${newest}`);
	await page.evaluate(() => Object.assign(window, { feedMarker: true }));
	const shown = await feedEntries();
	expect(shown.length).toBeGreaterThan(0);

	await moveCustomer("CUST-0003", "Livecity");

	await expect.poll(() => notice().innerText()).toMatch(/^1 new entry\b/);
	// The page's own entries stayed where they were.
	expect(await feedEntries()).toEqual(shown);
	expect(await page.evaluate(() => "feedMarker" in window)).toBe(true);

	await notice().getByRole("link", { name: "Show new" }).click();
	await page.waitForURL((url) => url.pathname === "/activity" && !url.searchParams.has("before"));
	await expect
		.poll(async () => (await feedEntries())[0])
		.toMatch(/updated customer CUST-0003 city: Livetown → Livecity/);
	expect(await notice().count()).toBe(0);
});
