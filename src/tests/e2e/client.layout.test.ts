/**
 * The customer portal's shell, as Riedel's facilities contact uses it at a desk: the navigation in
 * a sidebar, pages that use the width (the bonus beside the wallet, orders as a table, the cart
 * beside the catalogue), and on a phone the navigation in a sheet and nothing wider than the
 * screen. And signing out of the portal. What the pages show is in `client.test.ts` and the
 * modules' portal tests.
 */
import type { Locator, Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, useApp, users } from "./app.ts";

const app = useApp({ user: users.riedel });

const sidebar = (page: Page) => page.locator('[data-slot="sidebar-container"]');
const navigation = (page: Page) => page.getByRole("navigation", { name: "Customer portal" });

/** The box of an element on the page, as it's painted. */
const box = async (locator: Locator) => (await locator.boundingBox())!;

describe("the customer portal at a desk", () => {
	test("has its navigation in a sidebar beside the page, the current page marked", async () => {
		const { page } = app;
		expect(app.path()).toBe("/portal");
		expect(await sidebar(page).isVisible()).toBe(true);
		const entries = await navigation(page).getByRole("link").allInnerTexts();
		expect(entries.slice(0, 4)).toEqual([
			"Home",
			"Report a breakdown",
			"Orders",
			"Equipment and locations",
		]);
		// SHLTR's modules with a page in the portal.
		for (const entry of ["Energy", "Partner bonus", "Parts shop"]) expect(entries).toContain(entry);
		const home = navigation(page).getByRole("link", { name: "Home" });
		expect(await home.getAttribute("aria-current")).toBe("page");
		// The page is beside the sidebar, not under it.
		const [nav, main] = await Promise.all([box(sidebar(page)), box(page.locator("main"))]);
		expect(main.x).toBeGreaterThanOrEqual(nav.x + nav.width - 1);
		expect(await fitsWidth(page)).toBe(true);
	});

	test("the home page has the bonus beside the wallet, and its orders as tables", async () => {
		const { page } = app;
		const [bonus, wallet] = await Promise.all([
			box(page.locator("[data-client-home-bonus]")),
			box(page.locator("[data-client-wallet]")),
		]);
		expect(Math.abs(bonus.y - wallet.y)).toBeLessThan(2);
		expect(wallet.x).toBeGreaterThan(bonus.x + bonus.width);
		const open = page.getByRole("region", { name: "Open orders", exact: true });
		expect(await open.locator("[data-order-heads]").isVisible()).toBe(true);
		// Recently completed work under them (beside them on a very wide screen).
		const recent = page.getByRole("region", { name: "Recently completed", exact: true });
		expect(await recent.locator("[data-order-heads]").isVisible()).toBe(true);
		expect((await box(recent)).y).toBeGreaterThan((await box(open)).y);
		// The modules' cards come first.
		expect((await box(open)).y).toBeGreaterThan(wallet.y);
	});

	test("the sidebar's entries lead to their pages, e.g. the orders as a table", async () => {
		const { page } = app;
		await navigation(page).getByRole("link", { name: "Orders" }).click();
		await page.waitForURL((url) => url.pathname === "/portal/orders");
		await page.getByRole("heading", { level: 1, name: "Orders" }).waitFor();
		expect(await page.locator("main [data-order-heads]").isVisible()).toBe(true);
		expect(
			await navigation(page).getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
		).toBe("page");
		// A row: its number, what and status side by side.
		const row = page.locator("main [data-order]").first();
		const [heads, first] = await Promise.all([
			box(page.locator("main [data-order-heads]")),
			box(row),
		]);
		expect(first.width).toBeCloseTo(heads.width, 0);
	});

	test("the shop has the cart beside the catalogue", async () => {
		const { page } = app;
		await navigation(page).getByRole("link", { name: "Parts shop" }).click();
		await page.waitForURL((url) => url.pathname === "/parts-shop/portal");
		const [catalogue, cart] = await Promise.all([
			box(page.locator("[data-catalogue-category]").first()),
			box(page.locator("[data-checkout]")),
		]);
		expect(cart.x).toBeGreaterThan(catalogue.x + catalogue.width);
		expect(cart.y).toBeLessThan(catalogue.y + catalogue.height);
	});

	test("the sidebar folds to its icons, and opens again", async () => {
		const { page } = app;
		const wide = (await box(sidebar(page))).width;
		await page.locator('[data-sidebar="trigger"]').click();
		await expect.poll(async () => (await box(sidebar(page))).width).toBeLessThan(wide / 2);
		await page.locator('[data-sidebar="trigger"]').click();
		await expect.poll(async () => (await box(sidebar(page))).width).toBe(wide);
	});
});

describe("the customer portal on a phone", () => {
	test("has its navigation in a sheet, which closes once an entry is chosen", async () => {
		const { page } = app;
		await app.go("/portal");
		await onPhone(page, async () => {
			expect(await sidebar(page).isVisible()).toBe(false);
			expect(await navigation(page).count()).toBe(0);
			await page.locator('[data-sidebar="trigger"]').click();
			await navigation(page).waitFor();
			await navigation(page).getByRole("link", { name: "Equipment and locations" }).click();
			await page.waitForURL((url) => url.pathname === "/portal/equipment");
			await navigation(page).waitFor({ state: "detached" });
			expect(await page.locator("header").innerText()).toContain("Riedel B.V.");
		});
	});

	test("nothing on its pages is wider than the screen", async () => {
		const { page } = app;
		await onPhone(page, async () => {
			for (const path of [
				"/portal",
				"/portal/orders",
				"/portal/equipment",
				"/portal/report",
				"/parts-shop/portal",
				"/partner-programme/portal",
				"/energy/portal",
			]) {
				await app.go(path);
				expect(await fitsWidth(page), path).toBe(true);
			}
			await app.go("/portal/orders");
			// Cards, not a table's rows.
			expect(await page.locator("main [data-order-heads]").isVisible()).toBe(false);
			const order = await page.locator("main [data-order]").first().getAttribute("data-order");
			await app.go(`/portal/orders/${order}`);
			expect(await fitsWidth(page)).toBe(true);
		});
	});
});

describe("signing out of the customer portal", () => {
	test("lands on the login page, without errors", async () => {
		const { page } = app;
		await app.go("/portal");
		await page.getByRole("button", { name: "Sign out" }).click();
		await page.waitForURL((url) => url.pathname === "/login");
		await page.getByRole("button", { name: "Sign in" }).waitFor();
		await app.go("/portal");
		expect(app.path()).toBe("/login");
	});
});
