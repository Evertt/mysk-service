/**
 * The energy module and tenancy: SHLTR's managers make and revoke the feed's tokens, a planner
 * can't, and only changes nothing of the thresholds; a token feeds only its own tenant's site and
 * codes; North and South, which don't have the module, get 404s for its pages and remote queries,
 * and no tile on the dashboard.
 */
import { describe, expect, test } from "vite-plus/test";

import { baseURL, isRemote, organizations, rows, useApp, value } from "#e2e/app.ts";
import { signedInPage } from "#e2e/portal-helpers.ts";

import { lastQuarter, postBatch, readingOf, riedel, shltrOwner, shltrPlanner } from "./helpers.ts";

const { north, south, shltr } = organizations;
// North's and South's admin: neither tenant has the module.
const app = useApp();

/** The URL of SHLTR's overview query, as its owner's page asked for it, to try from elsewhere. */
let overviewQuery = "";

describe("SHLTR's integration tokens", () => {
	test("a manager makes one, which the feed then takes, and revokes it", async () => {
		const { page } = await signedInPage(app, shltrOwner);
		const { siteId } = await riedel();
		try {
			page.on("request", (request) => {
				if (isRemote(request.url(), "getEnergyOverview")) overviewQuery = request.url();
			});
			// Client-side, so the page loads its data through its remote query.
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

	test("a planner, who's no manager, can't manage them nor change the thresholds", async () => {
		const { page } = await signedInPage(app, shltrPlanner);
		const { siteId } = await riedel();
		try {
			await page.goto(`${baseURL}/energy`);
			await page.locator(`[data-energy-site="${siteId}"]`).waitFor();
			expect(await page.getByRole("link", { name: "Energy settings" }).count()).toBe(0);
			expect((await page.goto(`${baseURL}/energy/settings`))?.status()).toBe(403);

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
	test("refuses a request without a valid token", async () => {
		const { siteId } = await riedel();
		const batch = { site: siteId, readings: [readingOf("Z-R61", lastQuarter(), 10)] };
		expect((await postBatch(batch, null)).status).toBe(401);
		expect((await postBatch(batch, "fwi_0000")).status).toBe(401);
	});

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

describe("in North and South, which don't have the module", () => {
	test("its pages are 404s and the sidebar lacks it", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		for (const tenant of [north, south]) {
			await app.go("/");
			if (tenant === south) await app.switchOrganization(tenant.name);
			const sidebar = page.locator('[data-sidebar="content"]');
			await sidebar.getByRole("link", { name: "Dashboard" }).waitFor();
			expect(await sidebar.getByRole("link", { name: "Energy" }).count()).toBe(0);
			expect(await page.locator("[data-energy-stat]").count()).toBe(0);
			for (const path of [
				"/energy",
				`/energy/${siteId}`,
				`/energy/${siteId}/report`,
				"/energy/settings",
			]) {
				expect((await app.expectingErrors(() => app.go(path)))?.status()).toBe(404);
			}
		}
	});

	test("its remote queries are refused", async () => {
		const { page } = app;
		expect(overviewQuery).not.toBe("");
		await app.go("/");
		const status = await app.expectingErrors(() =>
			page.evaluate(async (href) => {
				const response = await fetch(href);
				const body = (await response.json()) as { type: string; error?: { status?: number } };
				return body.type === "error" ? body.error?.status : response.status;
			}, overviewQuery),
		);
		expect(status).toBe(404);
	});
});
