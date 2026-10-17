/**
 * The energy module and tenancy: SHLTR's managers make and revoke the feed's tokens, a planner
 * can't, nor set a site up, and only reads the thresholds; a token feeds only its own tenant's site
 * and codes; North, which doesn't have the module, gets 404s for its pages and no tile on the
 * dashboard. That its remote queries refuse such a tenant is `remote-functions.spec.ts`'s, and
 * what the feed refuses `ingest.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { lastQuarter, postBatch, readingOf, riedel, shltrOwner, shltrPlanner } from "./helpers.ts";

const { shltr } = organizations;
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

	test("a planner, who's no manager, can't manage them nor set a site up or change its thresholds", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		const { siteId } = await riedel();
		const [customer] = await rows<{ code: string; site_id: number }>(
			`select c.code, s.site_id from energy_site s join customer_site cs on cs.id = s.site_id
			 join customer c on c.id = cs.customer_id where s.id = ?`,
			[siteId],
		);
		try {
			await page.goto(`${baseURL}/energy`);
			await page.locator(`[data-energy-site="${siteId}"]`).waitFor();
			expect(await page.getByRole("link", { name: "Energy settings" }).count()).toBe(0);
			expect((await page.goto(`${baseURL}/energy/settings`))?.status()).toBe(403);

			// The customer's card and the site's page offer no setup, and its page is a 403 (that the
			// managers' forms refuse a planner is `remote-functions.spec.ts`'s).
			await page.goto(`${baseURL}/customers/${customer.code}`);
			const card = page.locator(`[data-energy-card-site="${customer.site_id}"]`);
			await card.getByRole("link").first().waitFor();
			expect(await page.locator("[data-energy-add-site]").count()).toBe(0);
			expect(await card.getByRole("link", { name: /^Set up/ }).count()).toBe(0);
			await page.goto(`${baseURL}/energy/${siteId}`);
			await page.locator('[data-hero-chip="site"]').waitFor();
			expect(await page.getByRole("link", { name: "Set up" }).count()).toBe(0);
			expect((await page.goto(`${baseURL}/energy/${siteId}/setup`))?.status()).toBe(403);

			await page.goto(`${baseURL}/energy/${siteId}/thresholds`);
			await page.locator("[data-managers-only]").waitFor();
			expect(await page.locator('[data-threshold="Z-R61"]').count()).toBe(1);
			expect(await page.getByRole("button", { name: "Save" }).count()).toBe(0);
		} finally {
			await page.context().close();
		}
	});
});

describe("the feed", () => {
	test("takes only its tenant's site and codes, and stores nothing of a refused batch", async () => {
		const { siteId } = await riedel();
		const before = await value(`select count(*) from energy_reading`);
		const start = lastQuarter().subtract({ hours: 2 });
		expect(
			await postBatch({ site: 999_999, readings: [readingOf("Z-R61", start, 10)] }),
		).toMatchObject({ status: 404, body: { error: "unknown_site" } });
		expect(
			await postBatch({
				site: siteId,
				readings: [readingOf("Z-R61", start, 10), readingOf("Z-NORTH", start, 10)],
				doorEvents: [{ door: "DOCK 05", at: start.toString(), state: "open" }],
			}),
		).toMatchObject({
			status: 422,
			body: { error: "unknown_codes", unknown: { zones: ["Z-NORTH"], doors: ["DOCK 05"] } },
		});
		expect(
			await postBatch({ site: siteId, readings: [{ ...readingOf("Z-R61", start, 10), kwh: 9 }] }),
		).toMatchObject({ status: 422, body: { error: "invalid_batch" } });
		expect(await value(`select count(*) from energy_reading`)).toBe(before);
		// Only SHLTR has energy data at all.
		expect(
			await rows(`select distinct organization_id from energy_reading where organization_id <> ?`, [
				shltr.id,
			]),
		).toEqual([]);
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
