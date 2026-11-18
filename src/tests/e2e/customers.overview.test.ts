/**
 * A customer's sites in the office, as its head office follows them: the overview from the
 * customer's page (a card per site, worst first, the filter of those needing attention), live when
 * a fault is reported in the portal, a site's page, and its maintenance report, which prints alone
 * on A4. What the figures count and who sees which site is `customers/server/site-summary.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { rows, useApp, users, value } from "./app.ts";
import { signedInPage } from "./portal-helpers.ts";
import { printedSheet } from "./print.ts";
import {
	chipValue,
	customerSites,
	mark,
	notReloaded,
	openFaultsAt,
	reportBreakdown,
} from "./sites-helpers.ts";

const app = useApp({ user: users.shltrPlanner });

describe("the sites overview", () => {
	test("shows a head office's sites from the customer's page, and those needing attention", async () => {
		const { page } = app;
		const { code, siteIds } = await customerSites("Distributiecentrum Zutphen");
		await app.go(`/customers/${code}`);
		await page.locator("[data-sites-overview-link]").click();
		await page.waitForURL((url) => url.pathname === `/customers/${code}/sites`);
		const cards = page.locator("[data-site-card]");
		await cards.first().waitFor();
		expect(
			(
				await cards.evaluateAll((all) =>
					all.map((card) => Number(card.getAttribute("data-site-card"))),
				)
			).toSorted((a, b) => a - b),
		).toEqual(siteIds);
		for (const siteId of siteIds) {
			expect(await chipValue(page, siteId, "core.openFaults"), `site ${siteId}`).toBe(
				await openFaultsAt(siteId),
			);
		}
		// Worst first: those needing attention before the rest.
		const attention = await cards.evaluateAll((all) =>
			all.map((card) => card.getAttribute("data-attention") === "true"),
		);
		expect(attention).toEqual(attention.toSorted((a, b) => Number(b) - Number(a)));

		await page.locator('[data-chip="attention"]').click();
		await page.waitForURL((url) => url.searchParams.get("show") === "attention");
		await expect.poll(() => cards.count()).toBe(attention.filter(Boolean).length);
	});

	test("turns a site live when a fault is reported in the portal", async () => {
		const { page } = app;
		const { code, siteIds } = await customerSites("Riedel B.V.");
		const [siteId] = siteIds;
		await app.go(`/customers/${code}/sites`);
		await page.locator(`[data-site-card="${siteId}"]`).waitFor();
		await mark(page);
		const before = await chipValue(page, siteId, "core.openFaults");

		const { page: portal } = await signedInPage(app, users.riedel);
		try {
			await portal.goto(new URL("/portal/report", page.url()).href);
			await reportBreakdown(portal, "Snelroldeur hal 2 blijft hangen.");
		} finally {
			await portal.context().close();
		}
		await expect
			.poll(() => chipValue(page, siteId, "core.openFaults"), { timeout: 15_000 })
			.toBe(before + 1);
		expect(await page.locator(`[data-site-card="${siteId}"]`).getAttribute("data-attention")).toBe(
			"true",
		);
		expect(await notReloaded(page)).toBe(true);
	});
});

describe("a site", () => {
	test("has its page with its units and open work, and its report prints alone with its figures", async () => {
		const { page } = app;
		const { code, siteIds } = await customerSites("Riedel B.V.");
		const [siteId] = siteIds;
		await app.go(`/customers/${code}/sites`);
		await page.locator(`[data-site-card="${siteId}"] a`).first().click();
		await page.waitForURL((url) => url.pathname === `/customers/${code}/sites/${siteId}`);
		const units = await value<number>("select count(*) from equipment where site_id = ?", [siteId]);
		await page.locator("[data-site-units] [data-unit]").first().waitFor();
		expect(await page.locator("[data-site-units] [data-unit]").count()).toBe(units);

		await page.locator("[data-site-report]").first().click();
		await page.waitForURL((url) => url.pathname === `/customers/${code}/sites/${siteId}/report`);
		await page.getByLabel("From", { exact: true }).fill("2026-01-01");
		await page.getByLabel("To", { exact: true }).fill("2026-12-31");
		await page.getByRole("button", { name: "Show", exact: true }).click();
		await page.waitForURL((url) => url.searchParams.get("from") === "2026-01-01");
		const figure = (id: string) => page.locator(`[data-report-figure="${id}"]`);
		await figure("core.faultsReported").waitFor();
		const [{ reported }] = await rows<{ reported: number }>(
			`select count(distinct o.id) as reported from "order" o join order_unit ou on ou.order_id = o.id
			 join equipment e on e.id = ou.equipment_id where e.site_id = ? and o.type = 'breakdown'
			 and o.status <> 'cancelled' and date(o.created_at, 'unixepoch', 'localtime') between '2026-01-01' and '2026-12-31'`,
			[siteId],
		);
		// Once the report of the chosen period is in.
		await expect
			.poll(async () =>
				Number((await figure("core.faultsReported").textContent())!.replace(/\D/g, "")),
			)
			.toBe(reported);
		expect(await page.locator("[data-report-units] tbody tr").count()).toBe(units);
		expect(await page.locator("[data-report-figure^='condition.']").count()).toBeGreaterThan(0);

		await page.emulateMedia({ media: "print" });
		try {
			expect(await page.locator('[data-slot="sidebar-container"]').isVisible()).toBe(false);
			expect(await page.getByRole("button", { name: "Print" }).isVisible()).toBe(false);
			expect(await page.locator("[data-site-report]").isVisible()).toBe(true);
			expect(await printedSheet(page)).toEqual({ width: 210, height: 297 });
		} finally {
			await page.emulateMedia({ media: null });
		}
	});

	test("of another customer is a 404 under this customer's code", async () => {
		const { code } = await customerSites("Distributiecentrum Zutphen");
		const { siteIds } = await customerSites("Riedel B.V.");
		for (const path of [
			`/customers/${code}/sites/${siteIds[0]}`,
			`/customers/${code}/sites/${siteIds[0]}/report`,
		]) {
			expect((await app.expectingErrors(() => app.go(path)))?.status(), path).toBe(404);
		}
	});
});
