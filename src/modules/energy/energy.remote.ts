/**
 * The energy pages' data: the tenant's sites, a site's figures for a period (today against
 * yesterday, this month against last month), a zone's, the report's for a range of days, and a
 * live query that says when the readings, alerts or thresholds changed, so an open page asks again.
 */
import { getRequestEvent } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, eq, sql } from "drizzle-orm";
import * as v from "valibot";

import { isManager } from "#lib/auth/index.ts";
import { currentTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { changedAt, watchChanges } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment } from "#lib/server/db/schema.ts";

import { periods } from "./model.ts";
import { query } from "./remote-functions.ts";
import {
	loadSite,
	openAlertCount,
	periodRanges,
	reportRanges,
	siteFigures,
} from "./server/figures.ts";
import { energyAlert, energyConsumer, energySite } from "./server/schema.ts";

const siteId = v.pipe(v.number(), v.integer(), v.minValue(1));

/**
 * The tenant's energy sites, each with its live power, today's consumption and open alerts, and
 * whether the user may change the module's settings.
 */
export const getEnergySites = query(async () => {
	const sites = await db
		.select({ id: energySite.id })
		.from(energySite)
		.where(inTenant(energySite))
		.orderBy(asc(energySite.name));
	const now = Temporal.Now.instant();
	const figures = await Promise.all(
		sites.map(async ({ id }) => {
			const site = await loadSite(id);
			const { zones, doors } = await siteFigures(
				site,
				periodRanges("day", site.timeZone, now),
				now,
			);
			return {
				id,
				name: site.name,
				customerName: site.customerName,
				city: site.city,
				zones: zones.length,
				doors: doors.length,
				liveKw: zones.reduce((total, zone) => total + zone.liveKw, 0),
				kwhToday: zones.reduce((total, zone) => total + zone.kwh, 0),
				openAlerts: await openAlertCount(id),
			};
		}),
	);
	return { sites: figures, canManage: isManager(currentTenant().roles) };
});

/** A site with its customer, for the pages that show no figures. */
export const getEnergySite = query(siteId, (id) => loadSite(id));

/** A site's figures for a period, as of now (see `server/figures.ts`), and whether the user sets it up. */
export const getEnergyOverview = query(
	v.object({ site: siteId, period: v.picklist(periods) }),
	async ({ site: id, period }) => {
		const site = await loadSite(id);
		const now = Temporal.Now.instant();
		const ranges = periodRanges(period, site.timeZone, now);
		const { zones, doors, previousComplete } = await siteFigures(site, ranges, now);
		return {
			site,
			period,
			previousComplete,
			asOf: now,
			from: ranges.from,
			previousFrom: ranges.previousFrom,
			zones,
			doors,
			openAlerts: await openAlertCount(id),
			canManage: isManager(currentTenant().roles),
		};
	},
);

/** A zone of a site by its code: today's figures, its consumers and its doors. */
export const getEnergyZone = query(
	v.object({ site: siteId, zone: v.pipe(v.string(), v.maxLength(40)) }),
	async ({ site: id, zone: code }) => {
		const site = await loadSite(id);
		const now = Temporal.Now.instant();
		const { zones, doors, previousComplete } = await siteFigures(
			site,
			periodRanges("day", site.timeZone, now),
			now,
		);
		const zone = zones.find((found) => found.code === code);
		if (!zone) error(404, m.energy_zone_not_found());
		const consumers = await db
			.select({
				id: energyConsumer.id,
				name: energyConsumer.name,
				ratedKw: energyConsumer.ratedKw,
				serialNumber: equipment.serialNumber,
				unitName: equipment.name,
			})
			.from(energyConsumer)
			.leftJoin(...tenantJoin(equipment, energyConsumer.equipmentId))
			.where(and(inTenant(energyConsumer), eq(energyConsumer.zoneId, zone.id)))
			.orderBy(asc(energyConsumer.position), asc(energyConsumer.id));
		return {
			site,
			asOf: now,
			previousComplete,
			zone,
			consumers,
			doors: doors.filter((door) => door.zoneId === zone.id),
		};
	},
);

/** The longest range a report covers. */
const MAX_REPORT_DAYS = 92;

/** The report's figures: days `from` to `to` (`yyyy-mm-dd`) against as many days before them. */
export const getEnergyReport = query(
	v.object({
		site: siteId,
		from: v.pipe(v.string(), v.isoDate()),
		to: v.pipe(v.string(), v.isoDate()),
	}),
	async (input) => {
		const site = await loadSite(input.site);
		const now = Temporal.Now.instant();
		const first = Temporal.PlainDate.from(input.from);
		const last = Temporal.PlainDate.from(input.to);
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
						sql`${energyAlert.at} >= ${Math.floor(ranges.from.epochMilliseconds / 1000)}`,
						sql`${energyAlert.at} < ${Math.floor(ranges.to.epochMilliseconds / 1000)}`,
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
const energySubjects = [
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
export const watchEnergy = query.live(async function* () {
	const { organizationId } = currentTenant();
	const changes = watchChanges(organizationId, energySubjects);
	getRequestEvent().request.signal.addEventListener("abort", changes.stop, { once: true });
	try {
		yield changedAt(organizationId, energySubjects);
		for await (const _ of changes) yield changedAt(organizationId, energySubjects);
	} finally {
		changes.stop();
	}
});

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
