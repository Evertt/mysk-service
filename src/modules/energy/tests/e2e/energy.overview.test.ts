/**
 * The site's page after the mockup, against Riedel Ede: each door's card in the state its sensor
 * sent (shut, open with the panel up and the air leaking out, too long open, the snowflake on a
 * cold store's, the truck at an open dock door) with the header's summary, and the consumption
 * chart measured up to the latest reading, the hour being measured, the rest still to measure,
 * with its totals.
 */
import { describe, expect, test } from "vite-plus/test";

import { rows, useApp } from "#e2e/app.ts";

import { kwh, kwhToday, postBatch, riedel, shltrOwner } from "./helpers.ts";

const app = useApp({ user: shltrOwner });

const card = (code: string) => app.page.locator(`[data-door="${code}"]`);
const ago = (seconds: number) => Temporal.Now.instant().subtract({ seconds }).toString();

describe("the door cards", () => {
	test("show each door as its sensor last told: shut, open, open too long", async () => {
		const { page } = app;
		const { siteId } = await riedel();
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

describe("the consumption chart", () => {
	test("is measured up to the latest reading, the hour in it being measured, the rest to come", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}`);
		const chart = page.locator("[data-consumption-chart]");
		await chart.waitFor();
		expect(await chart.locator("[data-bar]").count()).toBe(24);

		const [{ until }] = await rows<{ until: number }>(
			`select max(r.start) + 900 as until from energy_reading r
			 join energy_zone z on z.id = r.zone_id where z.energy_site_id = ?`,
			[siteId],
		);
		const local = Temporal.Instant.fromEpochMilliseconds(until * 1000).toZonedDateTimeISO(
			"Europe/Amsterdam",
		);
		const today = Temporal.Now.zonedDateTimeISO("Europe/Amsterdam").toPlainDate();
		const states = await chart
			.locator("[data-bar]")
			.evaluateAll((bars) => bars.map((bar) => (bar as HTMLElement).dataset.barState));
		if (local.toPlainDate().equals(today)) {
			const hour = local.hour;
			expect(states.slice(0, hour).every((state) => state === "measured")).toBe(true);
			expect(states[hour]).toBe("current");
			expect(states.slice(hour + 1).every((state) => state === "remaining")).toBe(true);
		}
		expect(await chart.getByText("Still to measure").count()).toBe(1);

		// Under it, today so far against yesterday to the same moment.
		expect(await chart.locator('[data-total="current"]').textContent()).toBe(
			kwh(await kwhToday(siteId)),
		);
		expect(await chart.locator('[data-total="change"]').textContent()).toMatch(/%|—/);
	});

	test("follows the selection, and is per day this month", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}?scope=zone:Z-IT&period=month`);
		const chart = page.locator("[data-consumption-chart]");
		await chart
			.locator('[data-slot="card-title"]', { hasText: "Consumption per day · Serverruimte" })
			.waitFor();
		const days = Temporal.Now.plainDateISO("Europe/Amsterdam").daysInMonth;
		expect(await chart.locator("[data-bar]").count()).toBe(days);
		expect(await chart.locator('[data-bar-state="current"]').count()).toBe(1);
	});
});
