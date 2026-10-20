/**
 * A site's alerts and thresholds on the seeded demo database: a batch over a zone's threshold
 * raises an alert, which becomes a survey order at the site's customer (a door's, a repair of its
 * unit), or is resolved, each once and logged; a manager changes a zone's thresholds (logged; off,
 * nothing is raised), which a planner may not. The server side of `energy.alerts.test.ts`, which
 * keeps the live page and its buttons.
 */
import { describe, expect, test } from "vite-plus/test";

import {
	getEnergyAlerts,
	makeAlertOrder,
	resolveEnergyAlert,
} from "#modules/energy/alerts.remote.ts";
import { getEnergyThresholds, saveEnergyThreshold } from "#modules/energy/thresholds.remote.ts";
import { as, call, data, rows, shltr, submit, value } from "#unit/lib/server/harness/index.ts";

import { feed, lastQuarter, readingOf, riedel, shltrId } from "./energy.test-support.ts";

interface Alert {
	id: number;
	zone_id: number;
	door_id: number | null;
	metric: string;
	severity: string;
	status: string;
	order_id: number | null;
}

const alertsOf = (siteId: number) =>
	rows<Alert>(
		`select id, zone_id, door_id, metric, severity, status, order_id from energy_alert
		 where energy_site_id = ? order by id`,
		[siteId],
	);

/** The order an alert became, with its customer and units. */
const orderOf = async (alertId: number) =>
	(
		await rows<{
			number: string;
			type: string;
			priority: string;
			description: string;
			customer: string;
			units: string | null;
		}>(
			`select o.number, o.type, o.priority, o.description, c.name as customer,
				(select group_concat(u.equipment_id) from order_unit u where u.order_id = o.id) as units
			 from energy_alert a join "order" o on o.id = a.order_id join customer c on c.id = o.customer_id
			 where a.id = ?`,
			[alertId],
		)
	)[0];

/** How often an alert was logged with `action`. */
const logged = (alertId: number, action: string) =>
	value<number>(
		`select count(*) from activity where organization_id = ? and action = ? and subject_id = ?`,
		[shltrId, action, String(alertId)],
	);

describe("a zone's alert", () => {
	let alert: Alert;

	test("is raised by a batch over its threshold, once, and listed with the open ones", async () => {
		const { siteId, zone } = await riedel();
		const batch = { site: siteId, readings: [readingOf("Z-LAB", lastQuarter(), 400)] };
		const answer = await feed(batch);
		expect(answer).toMatchObject({ status: 200, body: { readings: 1 } });
		// The zone's power alerts: late in the day the reading also takes the day's consumption,
		// with the seed's readings since midnight, over its kWh, which raises an energy alert too.
		const lab = async () =>
			(await alertsOf(siteId)).filter(
				(a) => a.zone_id === zone("Z-LAB").id && !a.door_id && a.metric === "power",
			);
		[alert] = await lab();
		expect(alert).toMatchObject({ metric: "power", severity: "active", status: "open" });
		expect(await feed(batch)).toMatchObject({ status: 200 });
		expect(await lab()).toHaveLength(1);

		const open = await as(shltr.member, () =>
			data(getEnergyAlerts, { site: siteId, status: "open" }),
		);
		expect(JSON.stringify(open)).toContain(`"id":${alert.id}`);
	});

	test("becomes a survey order at the site's customer, by any member; logged", async () => {
		const answer = await as(shltr.member, () => call(makeAlertOrder, alert.id));
		expect(answer.status).toBe(200);
		const order = await orderOf(alert.id);
		expect(answer.data).toEqual({ number: order.number });
		expect(order).toMatchObject({
			type: "survey",
			priority: "high",
			customer: "Riedel B.V.",
			units: null,
		});
		expect(order.description).toContain("Reduce the load in Laboratorium");
		expect(await value(`select status from energy_alert where id = ?`, [alert.id])).toBe("order");
		expect(await logged(alert.id, "alert_ordered")).toBe(1);
		// Once.
		expect(await as(shltr.member, () => call(makeAlertOrder, alert.id))).toMatchObject({
			status: 409,
		});
	});

	test("is resolved, once; logged", async () => {
		expect(await as(shltr.member, () => call(resolveEnergyAlert, alert.id))).toMatchObject({
			status: 200,
		});
		expect(await value(`select status from energy_alert where id = ?`, [alert.id])).toBe("done");
		expect(await logged(alert.id, "alert_resolved")).toBe(1);
		expect(await as(shltr.member, () => call(resolveEnergyAlert, alert.id))).toMatchObject({
			status: 409,
		});
	});

	test("of an unknown id is a 404", async () => {
		await as(shltr.member, async () => {
			expect(await call(makeAlertOrder, 999_999)).toMatchObject({ status: 404 });
			expect(await call(resolveEnergyAlert, 999_999)).toMatchObject({ status: 404 });
			expect(await call(getEnergyAlerts, { site: 999_999, status: null })).toMatchObject({
				status: 404,
			});
		});
	});
});

describe("a door's alert", () => {
	test("becomes a repair of the door's unit", async () => {
		const { siteId, door } = await riedel();
		const freezer = door("D-VR1");
		expect(freezer.equipment_id).not.toBeNull();
		// Raised as the ingest raises it for a door open too long (`ingest.spec.ts`).
		const zoneId = await value<number>(`select zone_id from energy_door where id = ?`, [
			freezer.id,
		]);
		const [{ id }] = await rows<{ id: number }>(
			`insert into energy_alert (organization_id, energy_site_id, zone_id, door_id, key, metric,
				severity, threshold, measured, at, created_at)
			 values (?, ?, ?, ?, ?, 'door', 'active', 4, 10, ?, ?) returning id`,
			[
				shltrId,
				siteId,
				zoneId,
				freezer.id,
				`spec-door-${freezer.id}`,
				Math.floor(Date.now() / 1000) - 600,
				Math.floor(Date.now() / 1000),
			],
		);
		expect(await as(shltr.member, () => call(makeAlertOrder, id))).toMatchObject({ status: 200 });
		expect(await orderOf(id)).toMatchObject({
			type: "repair",
			units: String(freezer.equipment_id),
		});
	});
});

describe("an alert dealt with twice at once", () => {
	/** A new open alert of the Laboratorium, as a batch raises it. */
	async function openAlert(key: string) {
		const { siteId, zone } = await riedel();
		const now = Math.floor(Date.now() / 1000);
		const [{ id }] = await rows<{ id: number }>(
			`insert into energy_alert (organization_id, energy_site_id, zone_id, key, metric, severity,
				threshold, measured, at, created_at)
			 values (?, ?, ?, ?, 'power', 'active', 100, 120, ?, ?) returning id`,
			[shltrId, siteId, zone("Z-LAB").id, key, now - 600, now],
		);
		return id;
	}
	const orders = () =>
		value<number>(`select count(*) from "order" where organization_id = ?`, [shltrId]);

	test("becomes one order: a double click's second is refused", async () => {
		const id = await openAlert("spec-twice");
		const before = await orders();
		const answers = await as(shltr.member, () =>
			Promise.all([call(makeAlertOrder, id), call(makeAlertOrder, id)]),
		);
		expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
		expect(await orders()).toBe(before + 1);
		expect(await orderOf(id)).toMatchObject({
			number: (answers[0].data as { number: string }).number,
		});
		expect(await logged(id, "alert_ordered")).toBe(1);
	});

	test("resolved meanwhile, becomes no order and stays done", async () => {
		const id = await openAlert("spec-resolved");
		const before = await orders();
		const [resolved, ordered] = await as(shltr.member, () =>
			Promise.all([call(resolveEnergyAlert, id), call(makeAlertOrder, id)]),
		);
		expect(resolved).toMatchObject({ status: 200 });
		expect(ordered).toMatchObject({ status: 409 });
		expect(await orders()).toBe(before);
		expect(await alertsOf(await riedel().then((site) => site.siteId))).toContainEqual(
			expect.objectContaining({ id, status: "done", order_id: null }),
		);
	});

	test("is resolved once", async () => {
		const id = await openAlert("spec-resolved-twice");
		const answers = await as(shltr.member, () =>
			Promise.all([call(resolveEnergyAlert, id), call(resolveEnergyAlert, id)]),
		);
		expect(answers.map((answer) => answer.status)).toEqual([200, 409]);
		expect(await logged(id, "alert_resolved")).toBe(1);
	});
});

describe("a zone's thresholds", () => {
	test("a manager changes them; logged", async () => {
		const { zone } = await riedel();
		const kv = zone("Z-KV");
		const answer = await as(shltr.owner, () =>
			submit(saveEnergyThreshold, { zoneId: String(kv.id), enabled: true, maxKw: 55, maxKwh: 300 }),
		);
		expect(answer.status).toBe(200);
		expect(
			await rows(`select enabled, max_kw, max_kwh from energy_threshold where zone_id = ?`, [
				kv.id,
			]),
		).toEqual([{ enabled: 1, max_kw: 55, max_kwh: 300 }]);
		expect(
			await value(
				`select count(*) from activity where organization_id = ? and subject_type = 'energy_threshold'
				 and subject_id = ?`,
				[shltrId, String(kv.id)],
			),
		).toBe(1);
	});

	test("switched off, raise nothing however far over", async () => {
		const { siteId, zone } = await riedel();
		const kv = zone("Z-KV");
		const off = await as(shltr.owner, () =>
			submit(saveEnergyThreshold, { zoneId: String(kv.id), maxKw: 55, maxKwh: 300 }),
		);
		expect(off.status).toBe(200);
		expect(await value(`select enabled from energy_threshold where zone_id = ?`, [kv.id])).toBe(0);
		expect(
			await feed({ site: siteId, readings: [readingOf("Z-KV", lastQuarter(), 999)] }),
		).toMatchObject({ status: 200, body: { alerts: 0 } });
	});

	test("are a planner's to read, not to change; an unknown zone is a 404", async () => {
		const { siteId, zone } = await riedel();
		const lab = zone("Z-LAB");
		const before = await rows(`select * from energy_threshold where zone_id = ?`, [lab.id]);
		await as(shltr.member, async () => {
			expect((await data(getEnergyThresholds, siteId)).zones.length).toBeGreaterThan(0);
			expect(
				await submit(saveEnergyThreshold, {
					zoneId: String(lab.id),
					enabled: true,
					maxKw: 1,
					maxKwh: 1,
				}),
			).toMatchObject({ status: 403 });
		});
		expect(
			await as(shltr.owner, () =>
				submit(saveEnergyThreshold, { zoneId: "999999", enabled: true, maxKw: 1, maxKwh: 1 }),
			),
		).toMatchObject({ status: 404 });
		expect(await rows(`select * from energy_threshold where zone_id = ?`, [lab.id])).toEqual(
			before,
		);
	});
});
