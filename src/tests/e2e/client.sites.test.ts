/**
 * The customer portal's sites, on a phone, for a head office that follows its sites: the overview
 * from the home page's row, live when a fault is reported, a site's page with its units, and its
 * maintenance report, which prints alone. Another customer's site is a 404. What the figures count
 * and who sees which site is `customers/server/site-summary.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, mobileViewport, useApp, users, value } from "./app.ts";
import {
	chipValue,
	customerSites,
	mark,
	notReloaded,
	openFaultsAt,
	reportBreakdown,
} from "./sites-helpers.ts";

const app = useApp({ user: users.riedel, viewport: mobileViewport });

describe("the sites overview", () => {
	test("is a row on the home page, a card per site that fits the phone", async () => {
		const { page } = app;
		const { siteIds } = await customerSites("Riedel B.V.");
		await app.go("/portal");
		await page.locator("[data-sites-link]").click();
		await page.waitForURL((url) => url.pathname === "/portal/sites");
		const card = page.locator(`[data-site-card="${siteIds[0]}"]`);
		await card.waitFor();
		expect(await page.locator("[data-site-card]").count()).toBe(siteIds.length);
		expect(await chipValue(page, siteIds[0], "core.openFaults")).toBe(
			await openFaultsAt(siteIds[0]),
		);
		expect(await page.locator("[data-app-bar] h1").textContent()).toBe("All sites");
		expect(await fitsWidth(page)).toBe(true);
	});

	test("shows a fault the moment it's reported", async () => {
		const { page } = app;
		const [siteId] = (await customerSites("Riedel B.V.")).siteIds;
		await app.go("/portal/sites");
		await page.locator(`[data-site-card="${siteId}"]`).waitFor();
		await mark(page);
		const before = await chipValue(page, siteId, "core.openFaults");

		// Reported from another tab of theirs, as a colleague at the site would.
		const other = await app.anotherTab();
		try {
			await other.goto(new URL("/portal/report", page.url()).href);
			await reportBreakdown(other, "Roldeur expeditie sluit niet.");
		} finally {
			await other.context().close();
		}
		await expect
			.poll(() => chipValue(page, siteId, "core.openFaults"), { timeout: 15_000 })
			.toBe(before + 1);
		expect(await notReloaded(page)).toBe(true);
	});
});

describe("a site", () => {
	test("has its page with its units, and its report prints alone with its figures", async () => {
		const { page } = app;
		const [siteId] = (await customerSites("Riedel B.V.")).siteIds;
		await app.go("/portal/sites");
		await page.locator(`[data-site-card="${siteId}"] a`).first().click();
		await page.waitForURL((url) => url.pathname === `/portal/sites/${siteId}`);
		const units = await value<number>("select count(*) from equipment where site_id = ?", [siteId]);
		await page.locator("[data-site-units] [data-unit]").first().waitFor();
		expect(await page.locator("[data-site-units] [data-unit]").count()).toBe(units);
		expect(await fitsWidth(page)).toBe(true);

		await page.locator("[data-site-report]").first().click();
		await page.waitForURL((url) => url.pathname === `/portal/sites/${siteId}/report`);
		const figure = (id: string) => page.locator(`[data-report-figure="${id}"]`);
		await figure("core.openFaults").waitFor();
		expect(Number((await figure("core.openFaults").textContent())!.replace(/\D/g, ""))).toBe(
			await openFaultsAt(siteId),
		);
		expect(await page.locator("[data-report-units] tbody tr").count()).toBe(units);
		// The contact reads the doors' losses, not the office's energy alerts.
		expect(await figure("energy.lostPeriod").count()).toBe(1);
		expect(await figure("energy.alerts").count()).toBe(0);

		await page.emulateMedia({ media: "print" });
		try {
			expect(await page.locator("[data-app-bar]").isVisible()).toBe(false);
			expect(await page.getByRole("button", { name: "Print" }).isVisible()).toBe(false);
			expect(await page.locator("[data-site-report]").isVisible()).toBe(true);
		} finally {
			await page.emulateMedia({ media: null });
		}
	});

	test("of another customer is a 404", async () => {
		const [other] = (await customerSites("Weggemans Logistiek")).siteIds;
		for (const path of [`/portal/sites/${other}`, `/portal/sites/${other}/report`]) {
			expect((await app.expectingErrors(() => app.go(path)))?.status(), path).toBe(404);
		}
		// Not in the overview either.
		await app.go("/portal/sites");
		await app.page.locator("[data-site-card]").first().waitFor();
		expect(await app.page.locator(`[data-site-card="${other}"]`).count()).toBe(0);
	});
});
