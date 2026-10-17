/**
 * The feed and the alerts in SHLTR: a batch over a zone's threshold raises an alert that the open
 * site's page shows without a reload; an alert becomes an order (a survey at Riedel for a zone, a
 * repair of the unit for the freezer's door) or is resolved; the thresholds are a manager's.
 */
import { describe, expect, test } from "vite-plus/test";

import { organizations, rows, useApp, value } from "#e2e/app.ts";

import { alertsOf, lastQuarter, postBatch, readingOf, riedel, shltrOwner } from "./helpers.ts";

const { shltr } = organizations;
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
		const lab = async () =>
			(await alertsOf(siteId)).filter((a) => a.zone_id === zone("Z-LAB").id && !a.door_id);
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

	test("a zone's alert becomes a survey order at the site's customer", async () => {
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
		const [order] = await rows<{
			number: string;
			type: string;
			priority: string;
			description: string;
			customer: string;
			units: number;
		}>(
			`select o.number, o.type, o.priority, o.description, c.name as customer,
				(select count(*) from order_unit u where u.order_id = o.id) as units
			 from energy_alert a join "order" o on o.id = a.order_id join customer c on c.id = o.customer_id
			 where a.id = ?`,
			[alert.id],
		);
		expect(order).toMatchObject({
			type: "survey",
			priority: "high",
			customer: "Riedel B.V.",
			units: 0,
		});
		expect(order.description).toContain("Reduce the load in Laboratorium");
		// Logged on the site's card, and gone from the open ones.
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and action = 'alert_ordered' and subject_id = ?`,
				[shltr.id, String(alert.id)],
			),
		).toBe(1);
		await app.go(`/energy/${siteId}/alerts?status=order`);
		await page
			.locator(`[data-alert="${alert.id}"]`)
			.getByRole("link", { name: order.number })
			.waitFor();
	});

	test("the freezer's door open too long becomes a repair of its unit", async () => {
		const { page } = app;
		const { siteId, door } = await riedel();
		const freezer = door("D-VR1");
		// Opened ten minutes ago (after its last event): four is its threshold.
		const latest = Number(
			await value(`select coalesce(max(at), 0) from energy_door_event where door_id = ?`, [
				freezer.id,
			]),
		);
		const tenAgo = Temporal.Now.instant().subtract({ minutes: 10 });
		const at =
			latest * 1000 >= tenAgo.epochMilliseconds
				? Temporal.Instant.fromEpochMilliseconds((latest + 1) * 1000)
				: tenAgo;
		const batch = {
			site: siteId,
			doorEvents: [{ door: "D-VR1", at: at.toString(), state: "open" }],
		};
		// Sent again until it's been open long enough: a batch that's in already is a tick.
		await expect
			.poll(
				async () => {
					await postBatch(batch);
					return (await alertsOf(siteId)).some(
						(a) => a.door_id === freezer.id && a.status === "open",
					);
				},
				{ timeout: 60_000, interval: 5_000 },
			)
			.toBe(true);
		const [alert] = (await alertsOf(siteId)).filter(
			(a) => a.door_id === freezer.id && a.status === "open",
		);
		await app.go(`/energy/${siteId}/alerts?status=open`);
		const row = page.locator(`[data-alert="${alert.id}"]`);
		expect(await row.locator("[data-recommendation]").textContent()).toMatch(
			/^Check Vriescel A: the door has been open \d+ min, 18.6 kW extra cooling\.$/,
		);
		await row.getByRole("button", { name: "Make order" }).click();
		await page.getByText(/^Order .+ made$/).waitFor();
		await expect
			.poll(async () => (await alertsOf(siteId)).find((a) => a.id === alert.id)?.status)
			.toBe("order");
		const [order] = await rows<{ type: string; unit: number }>(
			`select o.type, u.equipment_id as unit from energy_alert a join "order" o on o.id = a.order_id
			 join order_unit u on u.order_id = o.id where a.id = ?`,
			[alert.id],
		);
		expect(order).toEqual({ type: "repair", unit: freezer.equipment_id });
	}, 90_000);

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
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and subject_type = 'energy_threshold' and subject_id = ?`,
				[shltr.id, String(zone("Z-KV").id)],
			),
		).toBe(1);

		// Switched off: no alert, however far over.
		await card.getByLabel("Alerts").click();
		await app.submit(card.getByRole("button", { name: "Save" }));
		await expect
			.poll(() =>
				value(`select enabled from energy_threshold where zone_id = ?`, [zone("Z-KV").id]),
			)
			.toBe(0);
		const result = await postBatch({
			site: siteId,
			readings: [readingOf("Z-KV", lastQuarter(), 999)],
		});
		expect(result).toMatchObject({ status: 200, body: { alerts: 0 } });
	});

	test("refuses a threshold that isn't a positive number", async () => {
		const { page } = app;
		const card = page.locator('[data-threshold="Z-LAB"]');
		await card.getByLabel("Max. power (kW)").fill("0");
		await app.submit(card.getByRole("button", { name: "Save" }));
		expect(await app.issues()).toContain("A number above 0, up to 100,000");
	});
});
