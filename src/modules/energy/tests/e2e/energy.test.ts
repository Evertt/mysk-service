/**
 * The energy pages in SHLTR, against the seeded Riedel Ede: the sites, the site's page (the hero,
 * KPI tiles, the floor plan and the live meter, selecting a floor or a zone, door watch, the
 * comparison per zone, the savings advice), a zone's page from the selection, at phone width too,
 * and the printable report. The door cards and the chart are in `energy.overview.test.ts`.
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, onPhone, useApp } from "#e2e/app.ts";

import { kw, kwh, kwhToday, liveKw, riedel, shltrOwner } from "./helpers.ts";

const app = useApp({ user: shltrOwner });

const tile = (kpi: string) =>
	app.page.locator(`[data-kpi="${kpi}"] [data-slot="card-title"]`).first();

describe("the site's page", () => {
	test("is reached from the sidebar through the sites, and shows the KPI tiles", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go("/");
		await page.locator('[data-sidebar="content"]').getByRole("link", { name: "Energy" }).click();
		await page.waitForURL((url) => url.pathname === "/energy");
		await page.locator(`[data-energy-site="${siteId}"]`).click();
		await page.waitForURL((url) => url.pathname === `/energy/${siteId}`);
		await page.getByRole("heading", { name: "Energy performance per building zone" }).waitFor();
		expect(await page.locator('[data-hero-chip="site"]').textContent()).toContain(
			"Riedel Ede — Productielocatie",
		);

		expect(await tile("live").textContent()).toBe(kw(await liveKw(siteId)));
		expect(await tile("consumption").textContent()).toBe(kwh(await kwhToday(siteId)));
		for (const kpi of ["peak", "co2", "alerts", "doors"]) {
			expect(await tile(kpi).textContent()).toMatch(/\d/);
		}
		// The change against yesterday, or a dash right after midnight.
		expect(await page.locator('[data-kpi="consumption"] [data-change]').textContent()).toMatch(
			/vs yesterday/,
		);
	});

	test("shows the building by floor, the main meter, the doors and the comparison", async () => {
		const { page } = app;
		for (const floor of ["Begane grond", "1e verdieping", "Kelder", "Outside the building"]) {
			await page.locator(`[data-floor="${floor}"]`).waitFor();
		}
		expect(await page.locator("[data-floor] [data-zone]").count()).toBe(8);
		// Stacked as the mockup draws them, the top floor first; Expeditie & Docks full width.
		expect(
			await page
				.locator("[data-floor-select]")
				.evaluateAll((links) => links.map((link) => (link as HTMLElement).dataset.floorSelect)),
		).toEqual(["1e verdieping", "Begane grond", "Kelder"]);
		const ground = await page.locator('[data-floor="Begane grond"]').boundingBox();
		const dock = await page.locator('[data-zone="Z-DOCK"]').boundingBox();
		expect(dock!.width).toBeGreaterThan(ground!.width * 0.8);
		expect(
			(await page.locator("[data-legend] li").allTextContents()).map((text) => text.trim()),
		).toEqual(["Nominal", "Elevated", "Peak load", "Offline"]);
		expect(await page.locator('[data-zone="Z-EXP"]').getAttribute("data-tone")).toBe("offline");
		expect(await page.locator("[data-main-meter]").textContent()).toContain("Hoofdaansluiting");
		expect(
			await page
				.locator("[data-door]")
				.evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.door)),
		).toEqual(["D-05", "D-06", "D-KO1", "D-VR1"]);
		expect(await page.locator("[data-comparison] [data-zone-row]").count()).toBe(8);
		for (const advice of ["peak", "comparison", "night"]) {
			expect(await page.locator(`[data-advice="${advice}"]`).textContent()).toMatch(/\w/);
		}
		await page.locator("[data-energy-chart]").first().waitFor();
	});

	test("narrows to a floor with its button or on the plan, and to a zone on the plan", async () => {
		const { page } = app;
		await page.locator('[data-scope="floor:Kelder"]').click();
		await page.waitForURL((url) => url.searchParams.get("scope") === "floor:Kelder");
		await expect.poll(() => page.locator("[data-comparison] [data-zone-row]").count()).toBe(1);
		expect(await page.locator("[data-door]").count()).toBe(0);
		expect(await page.locator("[data-selection]").textContent()).toContain("Selection: Kelder");

		await page.locator('[data-floor-select="1e verdieping"]').click();
		await page.waitForURL((url) => url.searchParams.get("scope") === "floor:1e verdieping");
		await expect.poll(() => page.locator("[data-comparison] [data-zone-row]").count()).toBe(2);

		// A zone on the plan: the page stays where it was, and every panel follows.
		await page.locator('[data-zone="Z-DOCK"]').scrollIntoViewIfNeeded();
		const scrolled = await page.evaluate(() => window.scrollY);
		await page.locator('[data-zone="Z-DOCK"]').click();
		await page.waitForURL((url) => url.searchParams.get("scope") === "zone:Z-DOCK");
		await expect
			.poll(() => page.locator('[data-zone="Z-DOCK"]').getAttribute("aria-current"))
			.toBe("true");
		expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
		await page
			.locator("[data-detail-panel] [data-slot='card-title']", {
				hasText: "Detail · Expeditie & Docks",
			})
			.waitFor();
		expect(
			await page
				.locator("[data-installation]")
				.evaluateAll((items) => items.map((item) => (item as HTMLElement).dataset.installation)),
		).toEqual(["Dock-lift & deuren"]);
		await expect
			.poll(() =>
				page
					.locator("[data-door]")
					.evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.door)),
			)
			.toEqual(["D-05", "D-06"]);
		expect(
			await page.locator("[data-comparison] [data-zone-row]").getAttribute("data-zone-row"),
		).toBe("Z-DOCK");
	});

	test("compares this month with last month", async () => {
		const { page } = app;
		await page.locator('[data-period="month"]').click();
		await page.waitForURL((url) => url.searchParams.get("period") === "month");
		await page.locator('[data-kpi="consumption"]').getByText("Consumption this month").waitFor();
		// The scope stays.
		expect(new URL(page.url()).searchParams.get("scope")).toBe("zone:Z-DOCK");
		await page
			.locator('[data-energy-chart] [data-slot="card-title"]', { hasText: "Consumption per day" })
			.waitFor();
	});

	test("fits a phone's screen", async () => {
		const { siteId } = await riedel();
		await onPhone(app.page, async () => {
			await app.go(`/energy/${siteId}`);
			await app.page.locator("[data-door]").first().waitFor();
			expect(await fitsWidth(app.page)).toBe(true);
		});
	});
});

describe("a zone's page", () => {
	test("shows its figures, its consumers with their units, and its doors", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}`);
		// Selected on the plan, then its own page from the detail panel.
		await page.locator('[data-zone="Z-DOCK"]').click();
		await page.locator("[data-zone-page]").click();
		await page.waitForURL((url) => url.pathname === `/energy/${siteId}/zones/Z-DOCK`);
		await page.getByRole("heading", { name: "Z-DOCK · Expeditie & Docks" }).waitFor();
		const consumer = page.locator('[data-consumer="Dock-lift & deuren"]');
		// Linked to Riedel's leveller.
		expect(await consumer.getByRole("link").textContent()).toBe("Leveller L-03");
		expect(await page.locator("[data-door]").count()).toBe(2);
		await page.locator("[data-energy-chart]").waitFor();

		await app.go(`/energy/${siteId}/zones/Z-R62`);
		expect(await page.locator("[data-consumer]").count()).toBe(3);
		// The freezer's door is one of Riedel's units.
		expect(await page.locator('[data-door="D-VR1"]').getByRole("link").textContent()).toBe(
			"Vriessnelroldeur naar diepvriescel groot",
		);
	});

	test("of a zone the site doesn't have is a 404", async () => {
		const { siteId } = await riedel();
		const response = await app.expectingErrors(() => app.go(`/energy/${siteId}/zones/Z-NOPE`));
		expect(response?.status()).toBe(404);
	});
});

describe("the report", () => {
	test("covers this month by default, against the month before, and prints the report alone", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}`);
		await page.getByRole("link", { name: "Energy report" }).click();
		await page.waitForURL((url) => url.pathname === `/energy/${siteId}/report`);
		const header = page.locator("[data-report-header]");
		expect(await header.textContent()).toContain(
			"SHLTR · Energy Intelligence Report · Riedel Ede — Productielocatie",
		);
		expect(await page.locator("[data-report-summary] tbody tr").count()).toBe(6);
		expect(await page.locator("[data-report-zones] tbody tr").count()).toBe(8);
		expect(await page.locator("[data-report-doors] tbody tr").count()).toBe(4);

		// A range of its own.
		await page.getByLabel("From", { exact: true }).fill("2026-10-01");
		await page.getByLabel("To", { exact: true }).fill("2026-10-07");
		await page.getByRole("button", { name: "Show" }).click();
		await page.waitForURL((url) => url.searchParams.get("from") === "2026-10-01");
		await page.getByText(/\(7 days\)/).waitFor();

		await page.emulateMedia({ media: "print" });
		try {
			expect(await page.locator('[data-slot="sidebar-container"]').isVisible()).toBe(false);
			expect(await page.getByRole("button", { name: "Export PDF" }).isVisible()).toBe(false);
			expect(await header.isVisible()).toBe(true);
		} finally {
			await page.emulateMedia({ media: null });
		}
	});

	test("refuses a range of more than 92 days", async () => {
		const { siteId } = await riedel();
		const response = await app.expectingErrors(() =>
			app.go(`/energy/${siteId}/report?from=2026-01-01&to=2026-10-01`),
		);
		expect(response?.status()).toBe(400);
	});
});
