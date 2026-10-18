/**
 * The energy page of the customer portal: Riedel's contact reads their own site's figures and
 * door losses, read-only; and the office's energy pages aren't a contact's. That another
 * customer's contact sees none of Riedel's sites is `tests/unit/server/sites.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { isRemote, useApp } from "#e2e/app.ts";

import { kwh, kwhToday, riedel } from "./helpers.ts";

const app = useApp({ user: "facilitair@riedel.example" });

describe("in the customer portal", () => {
	test("Riedel's contact reads their site's energy from the portal's navigation", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		const queries: string[] = [];
		page.on("request", (request) => {
			if (isRemote(request.url(), "getClientEnergy")) queries.push(request.url());
		});
		await page.getByRole("link", { name: "Energy" }).click();
		await page.waitForURL((url) => url.pathname === "/energy/portal");
		const site = page.locator(`[data-client-site="${siteId}"]`);
		await site.waitFor();
		expect(
			await site.locator('[data-kpi="consumption"] [data-slot="card-title"]').textContent(),
		).toBe(kwh(await kwhToday(siteId)));
		expect(await site.locator("[data-comparison] [data-zone-row]").count()).toBe(8);
		expect(await site.locator("[data-client-door]").count()).toBe(4);
		// Read-only: nothing to act on, no way into the office.
		expect(await site.getByRole("button").count()).toBe(0);
		expect(await site.locator('a[href^="/equipment"], a[href^="/energy/"]').count()).toBe(0);
		expect(queries.length).toBeGreaterThan(0);

		await page.locator('[data-period="month"]').click();
		await page.waitForURL((url) => url.searchParams.get("period") === "month");
		await site.getByText("Consumption this month").waitFor();
	});

	test("the office's energy pages aren't a contact's", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.expectingErrors(() => app.go(`/energy/${siteId}`));
		expect(await page.locator("[data-main-meter]").count()).toBe(0);
		expect(await page.locator("[data-alerts]").count()).toBe(0);
	});
});
