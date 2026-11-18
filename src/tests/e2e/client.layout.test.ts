/**
 * The customer portal's shell, a phone app as Riedel's facilities contact uses it: on a phone the
 * page itself, with each page's app bar at the top and the tab bar at the foot (Home, Orders, Scan,
 * Equipment, More), the tab of the page marked, its controls as large as a tap, and nothing wider
 * than the screen; on a desk's screen the same app in a phone (`phone-frame.svelte`). More holds the
 * modules' pages and signing out. The scanner's camera, refused, offers to type the code. What the
 * pages show is in `client.test.ts` and the modules' portal tests.
 */
import type { Locator, Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, rows, useApp, users } from "./app.ts";

const app = useApp({ user: users.riedel });

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Customer portal" });
const screen = (page: Page) => page.locator("[data-phone-screen]");

/** The box of an element on the page, as it's painted. */
const box = async (locator: Locator) => (await locator.boundingBox())!;

/** Whether `inner` is painted inside `outer`, give or take a pixel. */
async function inside(inner: Locator, outer: Locator) {
	const [a, b] = await Promise.all([box(inner), box(outer)]);
	return (
		a.x >= b.x - 1 &&
		a.y >= b.y - 1 &&
		a.x + a.width <= b.x + b.width + 1 &&
		a.y + a.height <= b.y + b.height + 1
	);
}

describe("the customer portal on a phone", () => {
	test("has the tab bar at the foot of the screen, the current tab marked", async () => {
		const { page } = app;
		expect(app.path()).toBe("/portal");
		await onPhone(page, async () => {
			const viewport = page.viewportSize()!;
			expect(await tabBar(page).getByRole("link").allInnerTexts()).toEqual([
				"Home",
				"Orders",
				"Scan",
				"Equipment",
				"More",
			]);
			const bar = await box(tabBar(page));
			expect(Math.abs(bar.y + bar.height - viewport.height)).toBeLessThan(2);
			expect(bar.width).toBeCloseTo(viewport.width, 0);
			expect(
				await tabBar(page).getByRole("link", { name: "Home" }).getAttribute("aria-current"),
			).toBe("page");
			// Every tab is as large as a tap.
			for (const tab of await tabBar(page).getByRole("link").all()) {
				const { width, height } = await box(tab);
				expect(width).toBeGreaterThanOrEqual(44);
				expect(height).toBeGreaterThanOrEqual(44);
			}
			// The app bar at the top: the customer, and the bell.
			const header = page.locator("[data-app-bar]");
			expect((await box(header)).y).toBe(0);
			expect(await header.innerText()).toContain("Riedel B.V.");
			expect(await header.locator("[data-notification-bell]").count()).toBe(1);
			// No sidebar any more.
			expect(await page.locator('[data-slot="sidebar-container"]').count()).toBe(0);
			expect(await fitsWidth(page)).toBe(true);
		});
	});

	test("its tabs lead to their pages, which stay in view while the page scrolls", async () => {
		const { page } = app;
		await onPhone(page, async () => {
			await tabBar(page).getByRole("link", { name: "Orders" }).click();
			await page.waitForURL((url) => url.pathname === "/portal/orders");
			await page.getByRole("heading", { level: 1, name: "Orders" }).waitFor();
			expect(
				await tabBar(page).getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
			).toBe("page");
			await page.mouse.wheel(0, 2000);
			await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
			const viewport = page.viewportSize()!;
			const bar = await box(tabBar(page));
			expect(Math.abs(bar.y + bar.height - viewport.height)).toBeLessThan(2);
			expect((await box(page.locator("[data-app-bar]"))).y).toBe(0);

			// An order's page marks Orders, and its app bar leads back.
			await page.locator("main [data-order]").first().click();
			await page.waitForURL((url) => /^\/portal\/orders\/[^/]+$/.test(url.pathname));
			expect(
				await tabBar(page).getByRole("link", { name: "Orders" }).getAttribute("aria-current"),
			).toBe("page");
			await page.locator("[data-app-bar-back]").click();
			await page.waitForURL((url) => url.pathname === "/portal/orders");

			await tabBar(page).getByRole("link", { name: "Equipment" }).click();
			await page.waitForURL((url) => url.pathname === "/portal/equipment");
			await page.locator("main [data-unit]").first().waitFor();
		});
	});

	test("its controls are as large as a tap, the fields' text too large to zoom", async () => {
		const { page } = app;
		await app.go("/portal/report");
		await onPhone(page, async () => {
			const chips = page.locator("[data-report-faults] button");
			expect(await chips.count()).toBeGreaterThan(0);
			for (const chip of await chips.all()) {
				expect((await box(chip)).height).toBeGreaterThanOrEqual(44);
			}
			const unit = page.getByLabel("Unit");
			expect((await box(unit)).height).toBeGreaterThanOrEqual(44);
			expect(await unit.evaluate((element) => getComputedStyle(element).fontSize)).toBe("16px");
			const description = page.getByLabel("Description");
			expect(await description.evaluate((element) => getComputedStyle(element).fontSize)).toBe(
				"16px",
			);
			// The send button at the foot, over the tab bar, while the form scrolls.
			const send = page.getByRole("button", { name: "Send report" });
			const [button, bar] = await Promise.all([box(send), box(tabBar(page))]);
			expect(button.height).toBeGreaterThanOrEqual(48);
			expect(button.y + button.height).toBeLessThanOrEqual(bar.y + 1);
			expect(await fitsWidth(page)).toBe(true);
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
				"/portal/more",
				"/parts-shop/portal",
				"/partner-programme/portal",
				"/energy/portal",
			]) {
				await app.go(path);
				expect(await fitsWidth(page), path).toBe(true);
			}
			await app.go("/portal/orders");
			const order = await page.locator("main [data-order]").first().getAttribute("data-order");
			await app.go(`/portal/orders/${order}`);
			expect(await fitsWidth(page)).toBe(true);
		});
	});

	test("More lists the modules' pages, which mark More", async () => {
		const { page } = app;
		await app.go("/portal");
		await onPhone(page, async () => {
			await tabBar(page).getByRole("link", { name: "More" }).click();
			await page.waitForURL((url) => url.pathname === "/portal/more");
			const services = page.getByRole("navigation", { name: "Services" });
			// SHLTR's modules with a page in the portal.
			const entries = await services.getByRole("link").allInnerTexts();
			for (const entry of ["Energy", "Partner bonus", "Parts shop"]) {
				expect(entries).toContain(entry);
			}
			expect(await page.locator("[data-more-account]").innerText()).toContain("Marieke Verhoeven");
			await services.getByRole("link", { name: "Parts shop" }).click();
			await page.waitForURL((url) => url.pathname === "/parts-shop/portal");
			expect(
				await tabBar(page).getByRole("link", { name: "More" }).getAttribute("aria-current"),
			).toBe("page");
		});
	});

	test("the scanner, without the camera, says so and offers to type the code", async () => {
		const { page } = app;
		await app.go("/portal");
		await onPhone(page, async () => {
			await tabBar(page).getByRole("link", { name: "Scan" }).click();
			await page.waitForURL((url) => url.pathname === "/portal/scan");
			const scanner = page.getByRole("dialog", { name: "Scan a QR code" });
			// The test browser has no camera to give: refused or missing, it says which.
			await scanner.locator("[data-scan-blocked]").waitFor();
			const code = scanner.getByLabel("Serial number or code");
			// Another site's code leads nowhere.
			await code.fill("https://example.com/q/0123456789abcdef01234567");
			await scanner.getByRole("button", { name: "Open" }).click();
			await scanner.getByText("This code isn't one of ours.", { exact: false }).waitFor();
			expect(app.path()).toBe("/portal/scan");
			// Closed, back where it was opened from.
			await scanner.getByRole("button", { name: "Close the scanner" }).click();
			await page.waitForURL((url) => url.pathname === "/portal");

			// A unit's serial number, typed, opens its page.
			const [unit] = await rows<{ serial_number: string }>(
				`select e.serial_number from equipment e join customer c on c.id = e.customer_id
				 where c.name = 'Riedel B.V.' order by e.id limit 1`,
			);
			await app.go("/portal/scan");
			await scanner.locator("[data-scan-blocked]").waitFor();
			await code.fill(unit.serial_number);
			await scanner.getByRole("button", { name: "Open" }).click();
			await page.waitForURL(
				(url) => url.pathname === `/portal/equipment/${encodeURIComponent(unit.serial_number)}`,
			);
		});
	});
});

describe("the customer portal on a desk's screen", () => {
	test("is in a phone: a phone's screen, centred, with the app bar and tab bar in it", async () => {
		const { page } = app;
		await app.go("/portal");
		await page.locator("[data-phone-frame]").waitFor();
		const phone = await box(screen(page));
		expect(phone.width).toBeLessThanOrEqual(391);
		expect(phone.width / phone.height).toBeCloseTo(390 / 844, 2);
		const viewport = page.viewportSize()!;
		expect(Math.abs(phone.x + phone.width / 2 - viewport.width / 2)).toBeLessThan(2);
		expect(await inside(page.locator("[data-app-bar]"), screen(page))).toBe(true);
		expect(await inside(tabBar(page), screen(page))).toBe(true);
		// The tab bar at the foot of the phone's screen, the page scrolling inside it.
		const bar = await box(tabBar(page));
		expect(Math.abs(bar.y + bar.height - (phone.y + phone.height))).toBeLessThan(2);
		expect(
			await page
				.locator("[data-phone-scroll]")
				.evaluate((element) => element.scrollHeight > element.clientHeight),
		).toBe(true);
		expect(
			await page
				.getByText("Customer portal · how your customers see it on their phone")
				.isVisible(),
		).toBe(true);
		expect(await fitsWidth(page)).toBe(true);
	});
});

describe("signing out of the customer portal", () => {
	test("from More, lands on the login page, without errors", async () => {
		const { page } = app;
		await app.go("/portal/more");
		await page.getByRole("button", { name: "Sign out" }).click();
		await page.waitForURL((url) => url.pathname === "/login");
		await page.getByRole("button", { name: "Sign in" }).waitFor();
		await app.go("/portal");
		expect(app.path()).toBe("/login");
	});
});
