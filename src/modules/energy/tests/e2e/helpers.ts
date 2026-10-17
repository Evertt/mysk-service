/**
 * What the energy module's end-to-end tests share: the feed (`/energy/ingest`), SHLTR's site as
 * stored, its readings and alerts, how the pages format kW and kWh, and setting a site up.
 */
import type { Page } from "playwright";

import { baseURL, hydrated, organizations, rows, value } from "#e2e/app.ts";
import { DEMO_ENERGY_TOKEN } from "#modules/energy/server/riedel.ts";

/** SHLTR's owner, a manager, and its planner, a member. */
export const shltrOwner = "owner@shltr.example";
export const shltrPlanner = "jan@shltr.example";

const { shltr } = organizations;
const timeZone = "Europe/Amsterdam";

/** Sends `body` to the feed with `token` (SHLTR's demo token by default; `null` for none). */
export async function postBatch(
	body: object,
	token: string | null = DEMO_ENERGY_TOKEN,
	method: "POST" | "GET" = "POST",
) {
	const headers = {
		"content-type": "application/json",
		...(token ? { authorization: `Bearer ${token}` } : {}),
	};
	const url = new URL("/energy/ingest", baseURL);
	const response = await (method === "GET"
		? fetch(url, { headers, redirect: "manual" })
		: fetch(url, { method: "POST", headers, body: JSON.stringify(body), redirect: "manual" }));
	const text = await response.text();
	let json: Record<string, unknown> = {};
	try {
		json = JSON.parse(text) as Record<string, unknown>;
	} catch {
		// A redirect or an HTML error page: the status says enough.
	}
	return { status: response.status, body: json };
}

/** SHLTR's energy site (Riedel Ede) and its zones and doors by code. */
export async function riedel() {
	const siteId = Number(
		await value(`select id from energy_site where organization_id = ? order by id limit 1`, [
			shltr.id,
		]),
	);
	const zones = await rows<{ id: number; code: string; name: string }>(
		`select id, code, name from energy_zone where energy_site_id = ? order by position`,
		[siteId],
	);
	const doors = await rows<{ id: number; code: string; equipment_id: number | null }>(
		`select id, code, equipment_id from energy_door where energy_site_id = ? order by code`,
		[siteId],
	);
	return {
		siteId,
		zone: (code: string) => zones.find((zone) => zone.code === code)!,
		door: (code: string) => doors.find((door) => door.code === code)!,
		zones,
	};
}

/** The start of the latest quarter hour that has ended. */
export function lastQuarter(now = Temporal.Now.instant()) {
	const seconds = Math.floor(now.epochMilliseconds / 1000);
	return Temporal.Instant.fromEpochMilliseconds((seconds - (seconds % 900) - 900) * 1000);
}

/** A reading of `zone` for the interval from `start`, at `avgKw`. */
export const readingOf = (zone: string, start: Temporal.Instant, avgKw: number) => ({
	zone,
	start: start.toString(),
	avgKw,
	peakKw: Math.round(avgKw * 105) / 100,
	kwh: avgKw / 4,
});

/** The zones' live power as the page works it out: each one's latest interval, if recent. */
export async function liveKw(siteId: number) {
	const found = await rows<{ start: number; avg_kw: number }>(
		`select r.start, r.avg_kw from energy_reading r join energy_zone z on z.id = r.zone_id
		 where z.energy_site_id = ? and r.start = (select max(start) from energy_reading where zone_id = r.zone_id)`,
		[siteId],
	);
	const now = Date.now() / 1000;
	return found
		.filter((row) => now - (row.start + 900) <= 30 * 60)
		.reduce((sum, row) => sum + row.avg_kw, 0);
}

/** The site's consumption today (in Amsterdam), in kWh, from its readings. */
export async function kwhToday(siteId: number) {
	const midnight = Temporal.Now.zonedDateTimeISO(timeZone).startOfDay().toInstant();
	return Number(
		await value(
			`select coalesce(sum(r.kwh), 0) from energy_reading r join energy_zone z on z.id = r.zone_id
			 where z.energy_site_id = ? and r.start >= ?`,
			[siteId, midnight.epochMilliseconds / 1000],
		),
	);
}

/** The site's alerts, newest first. */
export const alertsOf = (siteId: number) =>
	rows<{
		id: number;
		key: string;
		metric: string;
		severity: string;
		status: string;
		zone_id: number;
		door_id: number | null;
		order_id: number | null;
	}>(
		`select id, key, metric, severity, status, zone_id, door_id, order_id from energy_alert
		 where energy_site_id = ? order by at desc, id desc`,
		[siteId],
	);

const one = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });

/** kW as the pages show them (`display.ts`): one decimal under 100, whole from 100. */
export const kw = (value: number) => `${value < 100 ? one.format(value) : whole.format(value)} kW`;

/** kWh as the pages show them. */
export const kwh = (value: number) =>
	`${value < 100 ? one.format(value) : whole.format(value)} kWh`;

/** One of SHLTR's customers by its name: its code, and its sites' ids by their names. */
export async function shltrCustomer(name: string) {
	const sites = await rows<{ code: string; id: number; name: string }>(
		`select c.code, s.id, s.name from customer c join customer_site s on s.customer_id = c.id
		 where c.organization_id = ? and c.name = ? order by s.name`,
		[shltr.id, name],
	);
	return {
		code: sites[0].code,
		site: (site: string) => sites.find((each) => each.name === site)!.id,
	};
}

/**
 * Sets up energy monitoring for the customer site `siteId` from the customer's page (`code`) on
 * `page`, with a contract of `peakKw` and the defaults otherwise: it opens the new site's setup
 * page. Answers the energy site's id.
 */
export async function setUpFromCustomer(
	page: Page,
	{ code, siteId, peakKw = 250 }: { code: string; siteId: number; peakKw?: number },
) {
	await page.goto(`${baseURL}/customers/${code}`);
	await hydrated(page);
	await page.locator(`[data-energy-add-site="${siteId}"]`).click();
	const dialog = page.getByRole("dialog");
	await dialog.getByLabel("Contracted peak (kW)").fill(String(peakKw));
	await dialog.getByLabel("Contracted kWh a year").fill("600000");
	await dialog.getByRole("button", { name: "Add energy site" }).click();
	await page.waitForURL((url) => /^\/energy\/\d+\/setup$/.test(url.pathname));
	await page.locator('[data-setup="zones"]').waitFor();
	return Number(new URL(page.url()).pathname.split("/")[2]);
}
