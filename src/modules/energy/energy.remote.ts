/**
 * The energy pages' data: the tenant's sites, a site's figures for a period (today against
 * yesterday, this month against last month), a zone's, the report's for a range of days, and a
 * live query that says when the readings, alerts or thresholds changed, so an open page asks again.
 */
import { error } from "@sveltejs/kit";
import { and, count, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { momentSeconds } from "#lib/dates.ts";
import { recordId } from "#lib/schema.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { live } from "#lib/server/live.ts";
import { orNotFound } from "#lib/server/records.ts";

import { periods } from "./model.ts";
import { query } from "./remote-functions.ts";
import {
	doorFigures,
	loadSite,
	loadSites,
	openAlertCount,
	openAlertCounts,
	periodRanges,
	reportRanges,
	siteConsumers,
	siteFigures,
	zoneFigures,
} from "./server/figures.ts";
import { energyAlert, energyDoor, energyZone } from "./server/schema.ts";

const siteId = recordId();

/**
 * The tenant's energy sites, each with its live power, today's consumption and open alerts.
 */
export const getEnergySites = query(async () => {
	const sites = await loadSites();
	const now = Temporal.Now.instant();
	const siteIds = sites.map((site) => site.id);
	// All sites' zones at once, each today in its own time zone (see `zoneFigures()`).
	const [figures, openAlerts, doors] = await Promise.all([
		zoneFigures(
			sites.map((site) => ({ site, ranges: periodRanges("day", site.timeZone, now) })),
			now,
		),
		openAlertCounts(siteIds),
		db
			.select({ siteId: energyDoor.energySiteId, count: count() })
			.from(energyDoor)
			.where(and(inTenant(energyDoor), inList(energyDoor.energySiteId, siteIds)))
			.groupBy(energyDoor.energySiteId),
	]);
	const doorsOf = new Map(doors.map((row) => [row.siteId, row.count]));
	return {
		sites: sites.map((site, index) => {
			const { zones } = figures[index];
			return {
				id: site.id,
				name: site.name,
				customerName: site.customerName,
				city: site.city,
				zones: zones.length,
				doors: doorsOf.get(site.id) ?? 0,
				liveKw: zones.reduce((total, zone) => total + zone.liveKw, 0),
				kwhToday: zones.reduce((total, zone) => total + zone.kwh, 0),
				openAlerts: openAlerts.get(site.id) ?? 0,
			};
		}),
	};
});

/** A site with its customer, for the pages that show no figures. */
export const getEnergySite = query(siteId, (id) => loadSite(id));

/** A site's figures for a period, as of now (see `server/figures.ts`). */
export const getEnergyOverview = query(
	v.object({ site: siteId, period: v.picklist(periods) }),
	async ({ site: id, period }) => {
		const site = await loadSite(id);
		const now = Temporal.Now.instant();
		const ranges = periodRanges(period, site.timeZone, now);
		const [{ zones, doors, previousComplete }, consumers] = await Promise.all([
			siteFigures(site, ranges, now),
			siteConsumers(site.id),
		]);
		return {
			site,
			period,
			previousComplete,
			asOf: now,
			from: ranges.from,
			previousFrom: ranges.previousFrom,
			zones,
			doors,
			consumers,
			openAlerts: await openAlertCount(id),
		};
	},
);

/** A zone of a site by its code: today's figures, its consumers and its doors. */
export const getEnergyZone = query(
	v.object({ site: siteId, zone: v.pipe(v.string(), v.maxLength(40)) }),
	async ({ site: id, zone: code }) => {
		const site = await loadSite(id);
		const now = Temporal.Now.instant();
		const sites = [{ site, ranges: periodRanges("day", site.timeZone, now) }];
		const [{ zones, previousComplete }] = await zoneFigures(sites, now, eq(energyZone.code, code));
		const zone = orNotFound(zones[0], m.energy_zone_not_found());
		const [consumers, [doors]] = await Promise.all([
			siteConsumers(site.id, zone.id),
			doorFigures(sites, now, eq(energyDoor.zoneId, zone.id)),
		]);
		return { site, asOf: now, previousComplete, zone, consumers, doors };
	},
);

/** The longest range a report covers. */
const MAX_REPORT_DAYS = 92;

/**
 * The report's figures: days `from` to `to` (`yyyy-mm-dd`) against as many days before them. Without
 * them, this month so far by the site's calendar (its time zone's, not the user's): from its 1st,
 * to its today.
 */
export const getEnergyReport = query(
	v.object({
		site: siteId,
		from: v.optional(v.pipe(v.string(), v.isoDate())),
		to: v.optional(v.pipe(v.string(), v.isoDate())),
	}),
	async (input) => {
		const site = await loadSite(input.site);
		const now = Temporal.Now.instant();
		const today = now.toZonedDateTimeISO(site.timeZone).toPlainDate();
		const first = input.from ? Temporal.PlainDate.from(input.from) : today.with({ day: 1 });
		const last = input.to ? Temporal.PlainDate.from(input.to) : today;
		const days = first.until(last).days + 1;
		if (days < 1 || days > MAX_REPORT_DAYS) error(400, m.energy_report_range_invalid());
		const ranges = reportRanges(first, last, site.timeZone, now);
		const [{ zones, doors, previousComplete }, alerts] = await Promise.all([
			siteFigures(site, ranges, now),
			db
				.select({
					metric: energyAlert.metric,
					severity: energyAlert.severity,
					status: energyAlert.status,
					count: sql<number>`count(*)`,
				})
				.from(energyAlert)
				.where(
					and(
						inTenant(energyAlert),
						eq(energyAlert.energySiteId, site.id),
						sql`${energyAlert.at} >= ${momentSeconds(ranges.from)}`,
						sql`${energyAlert.at} < ${momentSeconds(ranges.to)}`,
					),
				)
				.groupBy(energyAlert.metric, energyAlert.severity, energyAlert.status),
		]);
		return {
			organization: currentTenant().name,
			site,
			asOf: now,
			first,
			last,
			days,
			previousComplete,
			zones,
			doors,
			alerts,
		};
	},
);

/** The records the energy pages show: a change to any of them outdates them. */
const energyTypes = [
	"energy_site",
	"energy_zone",
	"energy_consumer",
	"energy_door",
	"energy_reading",
	"energy_alert",
	"energy_threshold",
	"order",
] as const;

/**
 * When the tenant's sites, readings, alerts or thresholds last changed (epoch ms, 0 if not since
 * the server started), sent again on each change: a new batch from a gateway, an alert made into an
 * order, a threshold changed, a zone or door set up.
 */
export const watchEnergy = query.live(() => live(energyTypes));

/** The dashboard's tile: the tenant's open alerts, and how many of them are over a threshold. */
export const getEnergyStat = query(async () => {
	const [row] = await db
		.select({
			open: sql<number>`count(*)`,
			active: sql<number>`coalesce(sum(${energyAlert.severity} = 'active'), 0)`,
		})
		.from(energyAlert)
		.where(and(inTenant(energyAlert), eq(energyAlert.status, "open")));
	return { open: row?.open ?? 0, active: row?.active ?? 0 };
});
