import type { Page } from "playwright";
import { expect, test } from "vite-plus/test";

import { hydrated, organizations, rows, useApp, value } from "./app.ts";

const { north } = organizations;
const app = useApp();

/** The number of a stat tile, by its label. */
const tile = (label: string) =>
	app.page
		.locator('[data-slot="card"]')
		.filter({
			has: app.page.locator('[data-slot="card-description"]', {
				hasText: new RegExp(`^${label}$`),
			}),
		})
		.locator('[data-slot="card-title"]');

/** The entries of the dashboard's "Recent activity", as text. */
const recentEntries = () =>
	app.page.getByRole("list", { name: "Recent changes", exact: true }).locator(":scope > li");

const urgentOrders = () =>
	value<number>(
		`select count(*) from "order" where organization_id = ? and priority = 'urgent'
		 and status in ('quote', 'scheduled', 'in_progress')`,
		[north.id],
	);

/** Makes an order urgent through its form, in a page of its own. */
async function makeUrgent(other: Page, number: string) {
	await other.goto(new URL(`/orders/${number}/edit`, app.page.url()).href);
	await hydrated(other);
	await other.getByLabel("Priority").selectOption("urgent");
	await other.getByRole("button", { name: "Save order" }).click();
	await other.waitForURL((url) => url.pathname === `/orders/${number}`);
}

test("an open dashboard shows another user's change in its numbers and recent activity", async () => {
	const { page } = app;
	await app.go("/");
	// Gone if the page reloads.
	await page.evaluate(() => Object.assign(window, { dashboardMarker: true }));
	const before = await urgentOrders();
	expect(await tile("Urgent").innerText()).toBe(String(before));

	const [order] = await rows<{ number: string }>(
		`select number from "order" where organization_id = ? and priority <> 'urgent'
		 and status in ('quote', 'scheduled', 'in_progress') order by id limit 1`,
		[north.id],
	);
	// Each refresh asks for the numbers once.
	let asked = 0;
	page.on("request", (request) => {
		if (/\/_app\/remote\/[^/]+\/getDashboard/.test(request.url())) asked++;
	});

	const other = await app.anotherTab();
	try {
		await makeUrgent(other, order.number);
	} finally {
		await other.context().close();
	}
	expect(await urgentOrders()).toBe(before + 1);

	// The dashboard caught up by itself.
	await expect.poll(() => tile("Urgent").innerText()).toBe(String(before + 1));
	await expect
		.poll(async () => (await recentEntries().first().innerText()).replace(/\s+/g, " "))
		.toMatch(new RegExp(`updated order ${order.number} .*priority`, "i"));
	expect(await page.evaluate(() => "dashboardMarker" in window)).toBe(true);
	// One change, one refresh (after its burst settled).
	await page.waitForTimeout(1_000);
	expect(asked).toBe(1);
});
