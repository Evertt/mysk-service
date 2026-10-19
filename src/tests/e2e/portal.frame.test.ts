/**
 * The engineer portal on a desk's screen: shown in a phone (`phone-frame.svelte`), with what's
 * fixed in it (menus, notifications) kept inside the phone's screen; on a phone's screen no frame,
 * the portal is the page, its header with room for the engineer's name. And signing out of the
 * portal, from the header's menu.
 */
import type { Locator, Page } from "playwright";
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, useApp, users } from "./app.ts";
import { openFieldMenu, signOutOfPortal } from "./portal-helpers.ts";

const app = useApp({ user: users.engineer });

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

describe("the engineer portal on a desk's screen", () => {
	test("is in a phone: a phone's screen, centred, with its status bar and a caption", async () => {
		const { page } = app;
		expect(app.path()).toBe("/my");
		await page.locator("[data-phone-frame]").waitFor();
		const phone = await box(screen(page));
		// 390 × 844, scaled down to fit the window's height if need be.
		expect(phone.width).toBeLessThanOrEqual(391);
		expect(phone.width / phone.height).toBeCloseTo(390 / 844, 2);
		const viewport = page.viewportSize()!;
		expect(Math.abs(phone.x + phone.width / 2 - viewport.width / 2)).toBeLessThan(2);
		// The portal's header and work are in the screen, which scrolls, not the page.
		expect(await inside(page.locator("header"), screen(page))).toBe(true);
		expect(await inside(page.locator("main [data-order]").first(), screen(page))).toBe(true);
		expect(
			await page.evaluate(
				() => document.documentElement.scrollHeight <= document.documentElement.clientHeight,
			),
		).toBe(true);
		expect(
			await page
				.locator("[data-phone-scroll]")
				.evaluate((element) => element.scrollHeight > element.clientHeight),
		).toBe(true);
		expect(
			await page.getByText("Engineer portal · how engineers see it on their phone").isVisible(),
		).toBe(true);
		expect(await fitsWidth(page)).toBe(true);
	});

	test("its menus open inside the phone's screen", async () => {
		const { page } = app;
		const menu = await openFieldMenu(page);
		// The language's choices open below their item, over the menu.
		await menu.getByRole("menuitem", { name: /^Language/ }).click();
		await page.getByRole("menuitemradio", { name: "Nederlands" }).waitFor();
		// In the phone's screen, not in <body>, and painted within it.
		const menus = page.locator("[data-phone-overlays]").getByRole("menu");
		expect(await menus.count()).toBe(2);
		for (const each of await menus.all()) expect(await inside(each, screen(page))).toBe(true);
		await page.keyboard.press("Escape");
		await page.keyboard.press("Escape");
		await expect.poll(() => page.getByRole("menu").count()).toBe(0);
	});

	test("its notifications show inside the phone's screen", async () => {
		const { page } = app;
		await page.locator("main a[data-order]").first().click();
		await page.waitForURL((url) => /^\/my\/[^/]+$/.test(url.pathname));
		await page.getByLabel("Add a note").fill("Seen on a desk.");
		await page.getByRole("button", { name: "Add note" }).click();
		const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Note added" });
		await toast.waitFor();
		expect(await screen(page).locator("[data-sonner-toast]").count()).toBeGreaterThan(0);
		// Once it has slid in.
		await expect.poll(() => inside(toast, screen(page))).toBe(true);
		await app.toast("Note added");
	});

	test("on a phone's screen it's the page itself, without a phone around it", async () => {
		const { page } = app;
		await app.go("/my");
		await onPhone(page, async () => {
			const display = (selector: string) =>
				page.locator(selector).evaluate((element) => getComputedStyle(element).display);
			expect(await display("[data-phone-frame]")).toBe("contents");
			expect(await display("[data-phone-screen]")).toBe("contents");
			expect(await page.getByText("how engineers see it on their phone").isVisible()).toBe(false);
			// The page scrolls, as before.
			expect(
				await page.evaluate(
					() => document.documentElement.scrollHeight > document.documentElement.clientHeight,
				),
			).toBe(true);
			expect(await fitsWidth(page)).toBe(true);
			// The header has room for the engineer's name, whole, beside the bell and the menu (the
			// record button joins them only while it records).
			const name = page.locator("header a span.truncate").first();
			expect(await name.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
				true,
			);
			expect(await page.locator("header button").count()).toBe(2);
			// Its menus are where the trigger is, in the window, the language's choices too.
			const menu = await openFieldMenu(page);
			await menu.getByRole("menuitem", { name: /^Language/ }).click();
			await page.getByRole("menuitemradio", { name: "Nederlands" }).waitFor();
			for (const each of await page.getByRole("menu").all()) {
				const { x, width } = await box(each);
				expect(x).toBeGreaterThanOrEqual(0);
				expect(x + width).toBeLessThanOrEqual(page.viewportSize()!.width);
			}
			await page.keyboard.press("Escape");
			await page.keyboard.press("Escape");
			await expect.poll(() => page.getByRole("menu").count()).toBe(0);
		});
		// And back in the phone on the desk's screen.
		await page.locator("[data-phone-screen]").evaluate((element) => {
			if (getComputedStyle(element).display !== "flex") throw new Error("no phone");
		});
	});
});

describe("signing out of the engineer portal", () => {
	test("lands on the login page, without errors", async () => {
		const { page } = app;
		await app.go("/my");
		await signOutOfPortal(page);
		await page.getByRole("button", { name: "Sign in" }).waitFor();
		await app.go("/my");
		expect(app.path()).toBe("/login");
	});
});
