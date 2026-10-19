/**
 * The feed and the alerts in SHLTR: a batch over a zone's threshold raises an alert that the open
 * site's page shows without a reload; an alert becomes an order or is resolved; a manager changes
 * a zone's thresholds. What the alerts and thresholds store, refuse and log (a door's alert, a
 * threshold off, a planner) is `tests/unit/server/alerts.spec.ts`'s.
 */
import { describe, expect, test } from "vite-plus/test";

import { rows, useApp, value } from "#e2e/app.ts";

import { alertsOf, lastQuarter, postBatch, readingOf, riedel, shltrOwner } from "./helpers.ts";

const app = useApp({ user: shltrOwner });

const openAlerts = () => app.page.locator('[data-alerts] [data-alert-status="open"]');

describe("a batch from the feed", () => {
	test("over a zone's threshold raises an alert, which the open page shows at once", async () => {
		const { page } = app;
		const { siteId, zone } = await riedel();
		await app.go(`/energy/${siteId}`);
		await page.locator("[data-alerts], [data-alerts-empty]").first().waitFor();

		// The laboratory (max. 40 kW by default) at 400 kW over the last quarter hour.
		const result = await postBatch({
			site: siteId,
			readings: [readingOf("Z-LAB", lastQuarter(), 400)],
		});
		// (A door that's been open since the seed ran may raise one of its own.)
		expect(result).toMatchObject({ status: 200, body: { readings: 1 } });
		expect(result.body.alerts).toBeGreaterThanOrEqual(1);
		// The zone's power alerts: late in the day the reading also takes the day's consumption,
		// with the seed's readings since midnight, over its kWh, which raises an energy alert too.
		const lab = async () =>
			(await alertsOf(siteId)).filter(
				(a) => a.zone_id === zone("Z-LAB").id && !a.door_id && a.metric === "power",
			);
		const [alert] = await lab();
		expect(alert).toMatchObject({ metric: "power", severity: "active", status: "open" });

		// No reload: the live query tells the page.
		const row = page.locator(`[data-alert="${alert.id}"]`);
		await row.waitFor();
		expect(await openAlerts().count()).toBeGreaterThan(0);
		expect(await row.locator("[data-recommendation]").textContent()).toBe(
			"Reduce the load in Laboratorium or shift peak use to off-peak hours.",
		);
		expect(await row.textContent()).toContain("Power 400 of 40 kW");
		// The zone's tone follows.
		await expect
			.poll(() => page.locator('[data-zone="Z-LAB"]').getAttribute("data-tone"))
			.toBe("peak");

		// The same batch again raises nothing more.
		const again = await postBatch({
			site: siteId,
			readings: [readingOf("Z-LAB", lastQuarter(), 400)],
		});
		expect(again).toMatchObject({ status: 200, body: { readings: 1 } });
		expect(await lab()).toHaveLength(1);
	});

	test("a zone's alert becomes an order", async () => {
		const { page } = app;
		const { siteId, zone } = await riedel();
		const [alert] = (await alertsOf(siteId)).filter(
			(a) => a.zone_id === zone("Z-LAB").id && a.status === "open",
		);
		const row = page.locator(`[data-alert="${alert.id}"]`);
		await row.getByRole("button", { name: "Make order" }).click();
		await page.getByText(/^Order .+ made$/).waitFor();
		await expect
			.poll(async () => (await alertsOf(siteId)).find((a) => a.id === alert.id)?.status)
			.toBe("order");
		const order = await value<string>(
			`select o.number from energy_alert a join "order" o on o.id = a.order_id where a.id = ?`,
			[alert.id],
		);
		await app.go(`/energy/${siteId}/alerts?status=order`);
		await page.locator(`[data-alert="${alert.id}"]`).getByRole("link", { name: order }).waitFor();
	});

	test("an alert is resolved with Resolve", async () => {
		const { page } = app;
		const { siteId } = await riedel();
		await app.go(`/energy/${siteId}/alerts`);
		const open = (await alertsOf(siteId)).filter((a) => a.status !== "done");
		const target = open[0];
		await page
			.locator(`[data-alert="${target.id}"]`)
			.getByRole("button", { name: "Resolve" })
			.click();
		await page.getByText("Alert resolved").waitFor();
		await expect
			.poll(async () => (await alertsOf(siteId)).find((a) => a.id === target.id)?.status)
			.toBe("done");
		await expect
			.poll(() => page.locator(`[data-alert="${target.id}"]`).getAttribute("data-alert-status"))
			.toBe("done");
	});
});

describe("the thresholds", () => {
	test("a manager changes a zone's", async () => {
		const { page } = app;
		const { siteId, zone } = await riedel();
		await app.go(`/energy/${siteId}/thresholds`);
		const card = page.locator('[data-threshold="Z-KV"]');
		await card.getByLabel("Max. power (kW)").fill("55");
		await card.getByLabel("Max. consumption (kWh)").fill("300");
		await app.submit(card.getByRole("button", { name: "Save" }));
		await expect
			.poll(() =>
				rows<{ enabled: number; max_kw: number; max_kwh: number }>(
					`select enabled, max_kw, max_kwh from energy_threshold where zone_id = ?`,
					[zone("Z-KV").id],
				),
			)
			.toEqual([{ enabled: 1, max_kw: 55, max_kwh: 300 }]);
	});
});
