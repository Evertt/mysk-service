/**
 * The energy module and tenancy: SHLTR's managers make and revoke the feed's tokens; a planner
 * reads the tokens and the thresholds, and is offered no site's setup; North, which doesn't have the module, gets
 * 404s for its pages and no tile on the dashboard. That a planner is refused the managers' forms, and what the feed answers (another site, unknown codes, a refused token), is
 * `tests/unit/server/feed.spec.ts`'s and `sites.spec.ts`'s; that the module's remote queries refuse
 * a tenant without it `remote-functions.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, useApp } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { postBatch, riedel, shltrOwner, shltrPlanner } from "./helpers.ts";

// North's admin: North doesn't have the module.
const app = useApp();

describe("SHLTR's integration tokens", () => {
	test("a manager makes one, which the feed then takes, and revokes it", async () => {
		const { page } = await signedInPage(app, shltrOwner);
		const { siteId } = await riedel();
		try {
			await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Energy" }).click();
			await page.locator(`[data-energy-site="${siteId}"]`).click();
			await page.locator("[data-kpi]").first().waitFor();
			await page.goBack();
			await page.getByRole("link", { name: "Energy settings" }).click();
			await page.waitForURL((url) => url.pathname === "/energy/settings");
			// The seeded demo token, by its name and first characters only; the site's codes.
			await page.locator('[data-token="Simulator (demo)"]').waitFor();
			expect(await page.locator(`[data-site-codes="${siteId}"]`).textContent()).toContain("Z-R61");

			await page.getByLabel("Name").fill("E2E gateway");
			await page.getByRole("button", { name: "New token" }).click();
			const shown = page.locator("[data-new-token]");
			await shown.waitFor();
			const token = (await shown.textContent())!.trim();
			expect(token).toMatch(/^fwi_[0-9a-f]{40}$/);

			const listed = await postBatch({}, token, "GET");
			expect(listed.status).toBe(200);
			// Riedel's, and any a file before this one set up.
			expect(listed.body.sites).toContainEqual(
				expect.objectContaining({ id: siteId, name: "Riedel Ede — Productielocatie" }),
			);

			const row = page.locator('[data-token="E2E gateway"]');
			await row.getByRole("button", { name: "Revoke" }).click();
			await row.getByText("Revoked").waitFor();
			expect((await postBatch({}, token, "GET")).status).toBe(401);
		} finally {
			await page.context().close();
		}
	});

	test("a planner, who's no manager, reads them and the thresholds, and is offered no site's setup", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		const { siteId } = await riedel();
		try {
			// The organization's settings link to the module's, which the planner reads.
			await page.goto(`${baseURL}/settings`);
			await page.locator('[data-module="energy"]').getByRole("link", { name: "Set up" }).click();
			await page.waitForURL((url) => url.pathname === "/energy/settings");
			await page.locator("[data-managers-only]").waitFor();
			await page.locator('[data-token="Simulator (demo)"]').waitFor();
			expect(await page.locator(`[data-site-codes="${siteId}"]`).textContent()).toContain("Z-R61");
			expect(await page.getByLabel("Name").count()).toBe(0);
			expect(await page.getByRole("button", { name: "Revoke" }).count()).toBe(0);
			expect(await page.locator('a[href$="/setup"]').count()).toBe(0);

			await page.goto(`${baseURL}/energy/${siteId}`);
			await page.locator('[data-hero-chip="site"]').waitFor();
			expect(await page.getByRole("link", { name: "Set up" }).count()).toBe(0);

			await page.goto(`${baseURL}/energy/${siteId}/thresholds`);
			await page.locator("[data-managers-only]").waitFor();
			expect(await page.locator('[data-threshold="Z-R61"]').count()).toBe(1);
			expect(await page.getByRole("button", { name: "Save" }).count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("in North, which doesn't have the module", () => {
	test("its pages are 404s, the sidebar lacks it, and the dashboard has no tile of it", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go("/");
		const sidebar = page.locator('[data-sidebar="content"]');
		await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
		expect(await sidebar.getByRole("link", { name: "Energy" }).count()).toBe(0);
		expect(await page.locator("[data-energy-stat]").count()).toBe(0);
		expect((await app.expectingErrors(() => app.go(`/energy/${siteId}`)))?.status()).toBe(404);
	});
});
