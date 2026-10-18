/**
 * The energy pages in SHLTR, against the seeded Riedel Ede: the sites, the site's page (the hero,
 * KPI tiles, the floor plan and the live meter, selecting a floor or a zone, door watch, the
 * comparison per zone, the savings advice, the consumption chart), a zone's page from the
 * selection, at phone width too, the printable report, and the door cards in the state their
 * sensors sent (which bars of the chart are measured is `scope.spec.ts`'s).
 */
import { describe, expect, test } from "vite-plus/test";

import { fitsWidth, fixture, onPhone, useApp } from "#e2e/app.ts";

import { kw, kwh, kwhToday, liveKw, postBatch, riedel, shltrOwner } from "./helpers.ts";

const app = useApp({ user: shltrOwner });

const card = (code: string) => app.page.locator(`[data-door="${code}"]`);
const ago = (seconds: number) => Temporal.Now.instant().subtract({ seconds }).toString();

const tile = (kpi: string) =>
	app.page.locator(`[data-kpi="${kpi}"] [data-slot="card-title"]`).first();

// First in the file: after the other tests' visits to the site's page, the freezer's door no
// longer shows the opening posted here.
describe("the door cards", () => {
	test("show each door as its sensor last told: shut, open, open too long", async () => {
		const { page } = app;
		const { siteId, door } = await riedel();
		// What these doors' sensors told since 11 minutes ago is what's posted here: the seed's
		// events, or a reset of the simulation in a file before, can have one of the freezer's
		// openings (every half hour) in that time, later than the one posted.
		await fixture(
			`delete from energy_door_event where door_id in (?, ?, ?) and at > ? returning door_id`,
			[
				door("D-05").id,
				door("D-KO1").id,
				door("D-VR1").id,
				Math.floor(Temporal.Now.instant().epochMilliseconds / 1000) - 660,
			],
		);
		// The dock door shut a minute ago; the cold store just opened; the freezer opened 10
		// minutes ago (it alerts at 4).
		const posted = await postBatch({
			site: siteId,
			readings: [],
			doorEvents: [
				{ door: "D-05", at: ago(180), state: "open" },
				{ door: "D-05", at: ago(60), state: "closed" },
				{ door: "D-KO1", at: ago(120), state: "closed" },
				{ door: "D-KO1", at: ago(30), state: "open" },
				{ door: "D-VR1", at: ago(660), state: "closed" },
				{ door: "D-VR1", at: ago(600), state: "open" },
			],
		});
		expect(posted.status).toBe(200);

		await app.go(`/energy/${siteId}`);
		await card("D-05").waitFor();
		expect(await card("D-05").getAttribute("data-door-state")).toBe("closed");
		expect(await card("D-05").locator("[data-panel]").getAttribute("data-panel")).toBe("down");
		expect(await card("D-05").locator("[data-leak], [data-truck]").count()).toBe(0);
		expect(await card("D-05").locator("[data-open-minutes]").textContent()).toBe("shut");

		expect(await card("D-KO1").getAttribute("data-door-state")).toBe("open");
		expect(await card("D-KO1").locator("[data-panel]").getAttribute("data-panel")).toBe("up");
		expect(await card("D-KO1").locator("[data-leak] span").count()).toBe(3);
		expect(await card("D-KO1").locator("[data-snowflake]").count()).toBe(1);
		expect(await card("D-KO1").getByText("Open", { exact: true }).count()).toBe(1);

		expect(await card("D-VR1").getAttribute("data-door-state")).toBe("overdue");
		expect(await card("D-VR1").getByText("Open too long").count()).toBe(1);
		expect(await card("D-VR1").locator("[data-open-minutes]").textContent()).toMatch(
			/^1\d min open$/,
		);
		expect(await card("D-VR1").textContent()).toContain("alert from 4 min");
		expect(await card("D-VR1").textContent()).toMatch(/22 °C inside/);

		// The header counts the open doors on the page.
		const open = await page
			.locator('[data-door-state="open"], [data-door-state="overdue"]')
			.count();
		expect(await page.locator("[data-doors-open]").textContent()).toBe(
			`${open} door${open === 1 ? "" : "s"} open`,
		);
	});

	test("an open dock door has the truck backing up to it", async () => {
		const { siteId } = await riedel();
		await postBatch({
			site: siteId,
			readings: [],
			doorEvents: [{ door: "D-06", at: ago(30), state: "open" }],
		});
		await app.go(`/energy/${siteId}`);
		await card("D-06").locator("[data-truck]").waitFor();
		expect(await card("D-06").locator("[data-snowflake]").count()).toBe(0);
	});
});

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

	test("narrows to a floor with its button or on the plan, and to a zone on the plan, by day or month", async () => {
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

		// This month against last month, the scope staying, the chart per day.
		await page.locator('[data-period="month"]').click();
		await page.waitForURL((url) => url.searchParams.get("period") === "month");
		await page.locator('[data-kpi="consumption"]').getByText("Consumption this month").waitFor();
		expect(new URL(page.url()).searchParams.get("scope")).toBe("zone:Z-DOCK");
		const chart = page.locator("[data-consumption-chart]");
		await chart
			.locator('[data-slot="card-title"]', { hasText: "Consumption per day · Expeditie & Docks" })
			.waitFor();
		const days = Temporal.Now.plainDateISO("Europe/Amsterdam").daysInMonth;
		expect(await chart.locator("[data-bar]").count()).toBe(days);
		expect(await chart.locator('[data-bar-state="current"]').count()).toBe(1);
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

describe("the consumption chart", () => {
	test("shows today's hours, the rest still to measure, and today's total", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}`);
		const chart = page.locator("[data-consumption-chart]");
		await chart.waitFor();
		expect(await chart.locator("[data-bar]").count()).toBe(24);
		expect(await chart.getByText("Still to measure").count()).toBe(1);
		// Under it, today so far against yesterday to the same moment.
		expect(await chart.locator('[data-total="current"]').textContent()).toBe(
			kwh(await kwhToday(siteId)),
		);
		expect(await chart.locator('[data-total="change"]').textContent()).toMatch(/%|—/);
	});
});
