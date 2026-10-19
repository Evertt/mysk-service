/**
 * What a crash does to a page, made on purpose with the crash switch (`#lib/errors/crash-switch.ts`,
 * built into the e2e build only): a page that fails once loads again by itself, with a toast; one
 * that keeps failing says so inside the shell, with Try again; a module's part that fails shows its
 * card while the page around it works. (Which errors reset by themselves, and when, is
 * `classify.spec.ts`'s and `error-boundary.svelte.spec.ts`'s.)
 */
import { describe, expect, test } from "vite-plus/test";

import { useApp } from "./app.ts";

const app = useApp();

const resetToast = "Something went wrong, so it was loaded again.";
const maintenance = "maintenance/dashboard.cards/maintenance";

/** Makes `where` (`page:dashboard`, `part:<contribution id>`) throw on its next `times` mounts. */
const crash = (where: string, times: number) =>
	app.page.evaluate(
		([key, value]) => sessionStorage.setItem(key, value),
		[`fieldworks:crash:${where}`, String(times)],
	);

/** Stops the crashes a test asked for. */
const stopCrashing = () => app.page.evaluate(() => sessionStorage.clear());

const sidebar = () => app.page.locator('[data-sidebar="content"]');

/** To the dashboard from another page, through the sidebar. */
async function openDashboard() {
	await sidebar().getByRole("link", { name: "Dashboard" }).click();
	await app.page.waitForURL((url) => url.pathname === "/");
}

/** The dashboard's own heading ("Good morning, …"). */
const greeting = () => app.page.getByRole("heading", { level: 1, name: /^Good / });
/** An error page's view, of an unknown error. */
const failed = () => app.page.locator('[data-error-kind="unknown"]');

describe("a page that crashes", () => {
	test("once loads again by itself, with a toast", async () => {
		await app.go("/orders");
		await crash("page:dashboard", 1);
		await app.expectingErrors(async () => {
			await openDashboard();
			await app.toast(resetToast);
			await greeting().waitFor();
		});

		expect(await failed().count()).toBe(0);
	});

	test("again and again says so inside the shell; Try again loads it once it works", async () => {
		await app.go("/orders");
		await crash("page:dashboard", 99);
		await app.expectingErrors(async () => {
			await openDashboard();
			await failed().waitFor();
		});

		expect(await failed().textContent()).toContain("Something went wrong");
		expect(await failed().locator("[data-error-id]").textContent()).toMatch(/^[0-9a-f-]{36}$/);
		for (const name of ["Try again", "Reload"]) {
			expect(await failed().getByRole("button", { name }).count(), name).toBe(1);
		}
		expect(await failed().getByRole("link", { name: "Back to the dashboard" }).count()).toBe(1);
		// Inside the shell: the sidebar is still there.
		expect(await sidebar().getByRole("link", { name: "Orders" }).count()).toBeGreaterThan(0);

		await stopCrashing();
		await failed().getByRole("button", { name: "Try again" }).click();
		await greeting().waitFor();
		expect(await failed().count()).toBe(0);
	});
});

test("a module's part that crashes shows its card, while the page around it works", async () => {
	await app.go("/orders");
	await crash(`part:${maintenance}`, 99);
	const card = app.page.locator(`[data-extension-failed="${maintenance}"]`);
	await app.expectingErrors(async () => {
		await openDashboard();
		// It tried once by itself, then gave up.
		await app.toast(resetToast);
		await card.waitFor();
	});

	expect(await card.textContent()).toContain("Couldn't load what Maintenance plans adds here.");
	await greeting().waitFor();
	expect(await failed().count()).toBe(0);

	await stopCrashing();
	await card.getByRole("button", { name: "Try again" }).click();
	await card.waitFor({ state: "detached" });
	expect(await app.page.locator("[data-extension-failed]").count()).toBe(0);
});
