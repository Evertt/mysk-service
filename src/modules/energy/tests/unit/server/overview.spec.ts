/**
 * The sites' overview and the customer portal read all their sites' figures at once
 * (`sitesFigures()`, in as many statements as one site's): each site's are what its own pages read
 * (`siteFigures()`), also next to sites in other time zones, with other readings and doors, or
 * none. On Riedel's site and two more of Riedel's: one in New York with a copy of two of its zones
 * (their thresholds, their readings up to three hours ago at half the power, their doors and the
 * doors' events) and an alert, one in Tokyo with a zone that has never sent a reading.
 */
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";

import { getClientEnergy } from "#modules/energy/client/client-energy.remote.ts";
import { getEnergySites } from "#modules/energy/energy.remote.ts";
import type { Period } from "#modules/energy/model.ts";
import {
	loadSite,
	openAlertCount,
	periodRanges,
	siteFigures,
} from "#modules/energy/server/figures.ts";
import { as, data, rows, shltr } from "#unit/lib/server/harness/index.ts";

import { riedel } from "./energy.test-support.ts";

// One moment for the pages and for the figures they're compared with.
const now = Temporal.Now.instant();

const seconds = (at: Temporal.Instant) => Math.floor(at.epochMilliseconds / 1000);

/**
 * A new energy site at a new site of Riedel's in `timeZone`, with Riedel's zones `codes` (their
 * thresholds, their readings before `readUntil` at `scale`, their doors and the doors' events): its
 * id.
 */
async function copyOfRiedel(
	name: string,
	timeZone: string,
	codes: string[],
	{ scale = 1, readUntil = now } = {},
) {
	const { siteId: from } = await riedel();
	const [{ id: placeId }] = await rows<{ id: number }>(
		`insert into customer_site (organization_id, customer_id, name, city, country)
		 select organization_id, customer_id, ?, city, country from customer_site
		 where id = (select site_id from energy_site where id = ?) returning id`,
		[name, from],
	);
	const [{ id }] = await rows<{ id: number }>(
		`insert into energy_site (organization_id, site_id, name, meter_name, contracted_peak_kw,
			contracted_kwh_per_year, pv_capacity_kw, tariff, co2_factor, time_zone)
		 select organization_id, ?, ?, meter_name, contracted_peak_kw, contracted_kwh_per_year,
			pv_capacity_kw, tariff, co2_factor, ? from energy_site where id = ? returning id`,
		[placeId, `Riedel ${name}`, timeZone, from],
	);
	await rows(
		`insert into energy_zone (organization_id, energy_site_id, code, name, floor, area_m2, position)
		 select organization_id, ?, code, name, floor, area_m2, position from energy_zone
		 where energy_site_id = ? and code in (select value from json_each(?))`,
		[id, from, JSON.stringify(codes)],
	);
	// Each of Riedel's zones and its copy.
	const copies = `energy_zone o join energy_zone n on n.code = o.code and n.energy_site_id = ?
		where o.energy_site_id = ?`;
	await rows(
		`insert into energy_threshold (zone_id, organization_id, enabled, max_kw, max_kwh)
		 select n.id, t.organization_id, t.enabled, t.max_kw, t.max_kwh
		 from energy_threshold t join ${copies} and o.id = t.zone_id`,
		[id, from],
	);
	await rows(
		`insert into energy_reading (organization_id, zone_id, start, avg_kw, peak_kw, kwh)
		 select r.organization_id, n.id, r.start, r.avg_kw * ?, r.peak_kw * ?, r.kwh * ?
		 from energy_reading r join ${copies} and o.id = r.zone_id and r.start < ?`,
		[scale, scale, scale, id, from, seconds(readUntil)],
	);
	await rows(
		`insert into energy_door (organization_id, energy_site_id, zone_id, code, name, kind, loss_kw,
			threshold_minutes, inside_c, outside_c)
		 select d.organization_id, n.energy_site_id, n.id, d.code, d.name, d.kind, d.loss_kw,
			d.threshold_minutes, d.inside_c, d.outside_c
		 from energy_door d join ${copies} and o.id = d.zone_id`,
		[id, from],
	);
	await rows(
		`insert into energy_door_event (organization_id, door_id, at, open)
		 select e.organization_id, n.id, e.at, e.open from energy_door_event e
		 join energy_door o on o.id = e.door_id
		 join energy_door n on n.code = o.code and n.energy_site_id = ?
		 where o.energy_site_id = ?`,
		[id, from],
	);
	return id;
}

beforeAll(async () => {
	vi.spyOn(Temporal.Now, "instant").mockReturnValue(now);
	const newYork = await copyOfRiedel("New York", "America/New_York", ["Z-LAB", "Z-DOCK"], {
		scale: 0.5,
		readUntil: now.subtract({ hours: 3 }),
	});
	await rows(
		`insert into energy_alert (organization_id, energy_site_id, zone_id, key, metric, severity,
			threshold, measured, at)
		 select organization_id, energy_site_id, id, 'zone:test', 'power', 'active', 1, 2, ?
		 from energy_zone where energy_site_id = ? limit 1`,
		[seconds(now), newYork],
	);
	const tokyo = await copyOfRiedel("Tokyo", "Asia/Tokyo", []);
	await rows(
		`insert into energy_zone (organization_id, energy_site_id, code, name, area_m2)
		 select organization_id, id, 'Z-NEW', 'New hall', 100 from energy_site where id = ?`,
		[tokyo],
	);
});

afterAll(() => {
	vi.restoreAllMocks();
});

/** A site's own figures over `period`, as its page reads them. */
async function ownFigures(id: number, period: Period) {
	const site = await loadSite(id);
	return siteFigures(site, periodRanges(period, site.timeZone, now), now);
}

test("the overview shows each site's figures of today as its own page reads them", async () => {
	await as(shltr.member, async () => {
		const { sites } = await data(getEnergySites);
		expect(sites.map((site) => site.city)).toHaveLength(3);
		for (const shown of sites) {
			const { zones, doors } = await ownFigures(shown.id, "day");
			expect(shown).toMatchObject({
				zones: zones.length,
				doors: doors.length,
				liveKw: zones.reduce((total, zone) => total + zone.liveKw, 0),
				kwhToday: zones.reduce((total, zone) => total + zone.kwh, 0),
				openAlerts: await openAlertCount(shown.id),
			});
		}
		const copy = sites.find((site) => site.name === "Riedel New York")!;
		expect(copy).toMatchObject({ zones: 2, openAlerts: 1 });
		expect(copy.doors).toBeGreaterThan(0);
		expect(sites.find((site) => site.name === "Riedel Tokyo")).toMatchObject({
			zones: 1,
			doors: 0,
			liveKw: 0,
			kwhToday: 0,
		});
	});
});

test("the portal shows each of the contact's sites' figures as its own page reads them", async () => {
	for (const period of ["day", "month"] as const) {
		const { sites } = await as(shltr.customer, () => data(getClientEnergy, period));
		expect(sites).toHaveLength(3);
		for (const shown of sites) {
			const own = await as(shltr.customer, () => ownFigures(shown.site.id, period));
			expect(shown.previousComplete).toBe(own.previousComplete);
			expect(shown.zones).toEqual(own.zones);
			expect(shown.doors).toEqual(
				own.doors.map((door) => ({ ...door, unit: null, equipmentId: null })),
			);
		}
	}
});
