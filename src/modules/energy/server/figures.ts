/**
 * A site's figures over a period and the one before it, from its readings and door events, in
 * SQL aggregates where they can be (a period's sums and peaks per zone, kWh per zone per hour) and
 * with the pure rules of `../model.ts` for the rest (live power, states, tones, door loss): what
 * the site's page, a zone's page and the report show. Days and hours are the site's own (its time
 * zone), so "today" is the building's. Many sites' figures (the sites' overview, the customer
 * portal) take as many statements as one site's: each reads its zones' readings by a seek per zone,
 * between its own site's moments.
 */
import { and, asc, eq, getTableName, type SQL, sql } from "drizzle-orm";

import { earlier, fromMomentSeconds, later, momentSeconds } from "#lib/dates.ts";
import { inTenant, idInTenant, tenantJoin, sameTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment } from "#lib/server/db/schema.ts";
import { orNotFound } from "#lib/server/records.ts";

import {
	doorLossKwh,
	INTERVAL_MINUTES,
	isOffline,
	isOverdue,
	minutesOpenBetween,
	openings,
	openMinutes,
	type Period,
	thresholdRatio,
	thresholdState,
	zoneTone,
} from "../model.ts";
import { doorEvents } from "./door-events.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyReading,
	energySite,
	energyThreshold,
	energyZone,
} from "./schema.ts";
import { zoneThresholds } from "./thresholds.ts";

/** Sites with their customer, as `where` picks them. */
const selectSites = (where: SQL | undefined) =>
	db
		.select({
			id: energySite.id,
			name: energySite.name,
			meterName: energySite.meterName,
			contractedPeakKw: energySite.contractedPeakKw,
			contractedKwhPerYear: energySite.contractedKwhPerYear,
			pvCapacityKw: energySite.pvCapacityKw,
			tariff: energySite.tariff,
			co2Factor: energySite.co2Factor,
			timeZone: energySite.timeZone,
			siteId: customerSite.id,
			siteName: customerSite.name,
			city: customerSite.city,
			customerId: customer.id,
			customerCode: customer.code,
			customerName: customer.name,
		})
		.from(energySite)
		.innerJoin(...tenantJoin(customerSite, energySite.siteId))
		.innerJoin(...tenantJoin(customer, customerSite.customerId))
		.where(where);

/** The current tenant's site `id` with its customer, or a 404. */
export async function loadSite(id: number) {
	return orNotFound(await selectSites(idInTenant(energySite, id)), m.energy_site_not_found());
}

/**
 * The current tenant's sites with their customers, by name: those `where` picks (of the site, its
 * customer site or its customer), or all.
 */
export function loadSites(where?: SQL) {
	return selectSites(and(inTenant(energySite), where)).orderBy(
		asc(energySite.name),
		asc(energySite.id),
	);
}

export type EnergySite = Awaited<ReturnType<typeof loadSite>>;

/** The moments a period's figures span. */
interface Ranges {
	/** The period so far: from its start (a local midnight) to now (or its end). */
	from: Temporal.Instant;
	to: Temporal.Instant;
	/**
	 * The period before it, from its start (its chart: bucket N against this period's bucket N),
	 * to the same moment in it as now is in this one (its door losses; its readings' sums go only
	 * as far as this period's readings have come in, see `siteFigures()`).
	 */
	previousFrom: Temporal.Instant;
	previousTo: Temporal.Instant;
	/** The moment in the period before that a moment in this one compares with. */
	previousAt: (at: Temporal.Instant) => Temporal.Instant;
	/** Today's start at the site, for the thresholds, which are per day. */
	today: Temporal.Instant;
	/** How a chart's buckets go: hours of the day, or days. */
	bucket: "hour" | "day";
	/** How many buckets the current period's chart has. */
	buckets: number;
}

const startOf = (day: Temporal.PlainDate, timeZone: string) =>
	day.toZonedDateTime({ timeZone }).toInstant();

/**
 * Today against yesterday, or this month against last month, at `now` in `timeZone`. The previous
 * period's sums go to the same time of day (yesterday's), or the same day and time of last month,
 * by the clock on the wall, so a day of 23 or 25 hours between them doesn't shift them an hour;
 * a day last month hasn't (the 31st after a month of 30 days) compares with the whole of it.
 */
export function periodRanges(period: Period, timeZone: string, now: Temporal.Instant): Ranges {
	const day = now.toZonedDateTimeISO(timeZone).toPlainDate();
	const today = startOf(day, timeZone);
	if (period === "day") {
		const previousAt = (at: Temporal.Instant) =>
			earlier(at.toZonedDateTimeISO(timeZone).subtract({ days: 1 }).toInstant(), today);
		return {
			from: today,
			to: now,
			previousFrom: startOf(day.subtract({ days: 1 }), timeZone),
			previousTo: previousAt(now),
			previousAt,
			today,
			bucket: "hour",
			buckets: 24,
		};
	}
	const first = day.with({ day: 1 });
	const from = startOf(first, timeZone);
	const before = first.subtract({ months: 1 });
	const previousAt = (at: Temporal.Instant) => {
		const local = at.toZonedDateTimeISO(timeZone);
		return local.day <= before.daysInMonth
			? earlier(local.subtract({ months: 1 }).toInstant(), from)
			: from;
	};
	return {
		from,
		to: now,
		previousFrom: startOf(before, timeZone),
		previousTo: previousAt(now),
		previousAt,
		today,
		bucket: "day",
		buckets: first.daysInMonth,
	};
}

/** Days `first` to `last` (both included) against as many days before them, up to `now`. */
export function reportRanges(
	first: Temporal.PlainDate,
	last: Temporal.PlainDate,
	timeZone: string,
	now: Temporal.Instant,
): Ranges {
	const days = first.until(last).days + 1;
	const from = startOf(first, timeZone);
	const end = startOf(last.add({ days: 1 }), timeZone);
	const to = earlier(end, now);
	const previousFrom = startOf(first.subtract({ days }), timeZone);
	// By the clock on the wall, `days` before: a week across a change of summer time is 167 or 169
	// hours, and compares with all of them.
	const previousAt = (at: Temporal.Instant) =>
		earlier(at.toZonedDateTimeISO(timeZone).subtract({ days }).toInstant(), from);
	return {
		from,
		to,
		previousFrom,
		previousTo: previousAt(to),
		previousAt,
		today: startOf(now.toZonedDateTimeISO(timeZone).toPlainDate(), timeZone),
		bucket: days === 1 ? "hour" : "day",
		buckets: days === 1 ? 24 : days,
	};
}

/** Which bucket of a period a moment is in: its local hour, or its day since `from`. */
function bucketOf(
	at: Temporal.Instant,
	from: Temporal.Instant,
	ranges: Ranges,
	timeZone: string,
): number {
	const local = at.toZonedDateTimeISO(timeZone);
	if (ranges.bucket === "hour") return local.hour;
	return from.toZonedDateTimeISO(timeZone).toPlainDate().until(local.toPlainDate()).days;
}

/** A site with the ranges its figures span. */
export interface SiteRanges {
	site: EnergySite;
	ranges: Ranges;
}

/** The site's zones and doors over `ranges` (see above), at `now`: its page's and its report's. */
export async function siteFigures(site: EnergySite, ranges: Ranges, now: Temporal.Instant) {
	const sites = [{ site, ranges }];
	const [[zones], [doors]] = await Promise.all([zoneFigures(sites, now), doorFigures(sites, now)]);
	return { ...zones, doors };
}

/** A moment a statement over several sites' zones reads per zone, its site's own (`bound()`). */
type Bound = "from" | "to" | "until" | "previousFrom" | "previousUntil" | "todayFrom";

/**
 * Each site's moments as one JSON parameter, `{ "<site id>": { "from": <seconds>, … } }`, so a
 * statement binds them once however many sites it covers.
 */
const boundsOf = (bounds: Map<number, Record<string, Temporal.Instant>>) =>
	JSON.stringify(
		Object.fromEntries(
			[...bounds].map(([siteId, moments]) => [
				siteId,
				Object.fromEntries(Object.entries(moments).map(([name, at]) => [name, momentSeconds(at)])),
			]),
		),
	);

/**
 * The zone table by its name, for its columns in a subquery of a select of zones: drizzle writes a
 * column of the one table a select reads without it, which in a subquery of readings would name
 * the reading's own (`organization_id`).
 */
const zoneTable = sql.identifier(getTableName(energyZone));

/** The moment `name` of the zone's site in `bounds` (`boundsOf()`): read once per zone. */
const bound = (bounds: string, name: Bound) =>
	sql`json_extract(${bounds}, '$."' || ${zoneTable}.energy_site_id || '".${sql.raw(name)}')`;

/**
 * `aggregate` (code's own SQL, e.g. `max(r.start)`) of the zone's readings (`r`), with `range` those
 * that start from its site's first moment up to its second: a seek per zone on the readings' key
 * (zone, start), however long ago its readings began.
 */
function ofZone<T>(aggregate: string, range?: [bounds: string, from: Bound, to: Bound]) {
	const within = range
		? sql` and r.start >= ${bound(range[0], range[1])} and r.start < ${bound(range[0], range[2])}`
		: sql``;
	return sql<T>`(select ${sql.raw(aggregate)} from energy_reading r
		where r.organization_id = ${zoneTable}.organization_id and r.zone_id = ${zoneTable}.id${within})`;
}

/** The zone's latest interval's average power, by the same seek. */
const latestKwOfZone = sql<number | null>`(select r.avg_kw from energy_reading r
	where r.organization_id = ${zoneTable}.organization_id and r.zone_id = ${zoneTable}.id
	order by r.start desc limit 1)`;

/** A zone as `zoneFigures()` reads it first: its thresholds and its readings' first and last. */
type ZoneRow = Awaited<ReturnType<typeof selectZones>>[number];

const selectZones = (sites: SiteRanges[], now: Temporal.Instant, where: SQL | undefined) => {
	const periods = boundsOf(
		new Map(
			sites.map(({ site, ranges }) => [
				site.id,
				{ from: ranges.from, until: earlier(ranges.to, now) },
			]),
		),
	);
	const siteIds = sites.map(({ site }) => site.id);
	return db
		.select({
			id: energyZone.id,
			siteId: energyZone.energySiteId,
			code: energyZone.code,
			name: energyZone.name,
			floor: energyZone.floor,
			areaM2: energyZone.areaM2,
			enabled: energyThreshold.enabled,
			maxKw: energyThreshold.maxKw,
			maxKwh: energyThreshold.maxKwh,
			// The period's last interval that has come in, the first ever, and the latest (live power).
			last: ofZone<number | null>("max(r.start)", [periods, "from", "until"]),
			first: ofZone<number | null>("min(r.start)"),
			latestAt: ofZone<Temporal.Instant | null>("max(r.start)").mapWith(energyReading.start),
			latestKw: latestKwOfZone,
		})
		.from(energyZone)
		.leftJoin(...zoneThresholds())
		.where(and(inTenant(energyZone), inList(energyZone.energySiteId, siteIds), where))
		.orderBy(asc(energyZone.position), asc(energyZone.id));
};

/**
 * Each site's moments its zones' sums read between (`boundsOf()`). This period's sums hold the
 * intervals that have ended and come in: the previous period's go as far into it as those go into
 * this one, not to now (at 00:10 there's no reading of today yet, and a gateway that sends every
 * hour is up to an hour behind), for a like comparison.
 */
function boundsFor(sites: SiteRanges[], zones: ZoneRow[], now: Temporal.Instant) {
	return boundsOf(
		new Map(
			sites.map(({ site, ranges }) => {
				const until = earlier(ranges.to, now);
				const starts = zones.filter((zone) => zone.siteId === site.id).map((zone) => zone.last);
				const last = Math.max(...starts.filter((start) => start !== null));
				const readTo = Number.isFinite(last)
					? earlier(fromMomentSeconds(last).add({ minutes: INTERVAL_MINUTES }), until)
					: ranges.from;
				const previousTo = earlier(ranges.previousAt(readTo), ranges.previousTo);
				return [
					site.id,
					{
						from: ranges.from,
						to: ranges.to,
						until,
						previousFrom: ranges.previousFrom,
						previousUntil: earlier(previousTo, until),
						todayFrom: later(ranges.today, ranges.previousFrom),
					},
				];
			}),
		),
	);
}

/** A zone's sums over its site's moments, none for a zone without readings. */
const noSums = { kwh: 0, peakKw: 0, previousKwh: 0, previousPeakKw: 0, kwhToday: 0 };

/** The zone's figures from its row, its sums and its kWh per hour (UTC), over its site's `ranges`. */
function shapeZone(
	zone: ZoneRow,
	sums: typeof noSums,
	hours: { hour: number; kwh: number }[],
	{ site, ranges }: SiteRanges,
	now: Temporal.Instant,
) {
	const offline = isOffline(zone.latestAt, now);
	// Its latest interval's average, 0 while offline.
	const liveKw = offline || zone.latestKw === null ? 0 : zone.latestKw;
	const threshold =
		zone.enabled === null
			? null
			: { enabled: zone.enabled, maxKw: zone.maxKw!, maxKwh: zone.maxKwh! };
	const { ratio } = threshold
		? thresholdRatio({ kw: liveKw, kwh: sums.kwhToday }, threshold)
		: { ratio: 0 };
	const state = threshold && !offline ? thresholdState(ratio, threshold.enabled) : "off";
	// As many buckets before as now: day N against day N of last month, whose days past this
	// month's last aren't compared (and are 0 past its own last).
	const series = Array.from({ length: ranges.buckets }, () => 0);
	const previousSeries = Array.from({ length: ranges.buckets }, () => 0);
	for (const row of hours) {
		const at = fromMomentSeconds(row.hour * 3600);
		const current = Temporal.Instant.compare(at, ranges.from) >= 0;
		const bucket = bucketOf(at, current ? ranges.from : ranges.previousFrom, ranges, site.timeZone);
		const target = current ? series : previousSeries;
		if (bucket >= 0 && bucket < target.length) target[bucket] += row.kwh;
	}
	return {
		id: zone.id,
		code: zone.code,
		name: zone.name,
		floor: zone.floor,
		areaM2: zone.areaM2,
		liveKw,
		latestAt: zone.latestAt,
		offline,
		...sums,
		threshold,
		ratio,
		state,
		tone: zoneTone(offline, state),
		// kWh per bucket of the period, and of the one before.
		series,
		previousSeries,
	};
}

/** A zone's figures over the period. */
export type ZoneFigures = ReturnType<typeof shapeZone>;

/**
 * Each of `sites`' zones (those `where` picks, of `energyZone`; all without) over its own ranges
 * (its own time zone's days), in as many statements as for one site: a page of many sites doesn't
 * queue a few for each of them (the Durable Object runs them one at a time).
 */
export async function zoneFigures(sites: SiteRanges[], now: Temporal.Instant, where?: SQL) {
	if (!sites.length) return [];
	const zones = await selectZones(sites, now, where);
	const json = boundsFor(sites, zones, now);
	const ofZones = and(
		inTenant(energyZone),
		inList(
			energyZone.id,
			zones.map((zone) => zone.id),
		),
	);
	const start = energyReading.start;
	const [sums, hourly] = await Promise.all([
		db
			.select({
				zoneId: energyZone.id,
				kwh: ofZone<number>("coalesce(sum(r.kwh), 0)", [json, "from", "until"]),
				peakKw: ofZone<number>("coalesce(max(r.peak_kw), 0)", [json, "from", "until"]),
				previousKwh: ofZone<number>("coalesce(sum(r.kwh), 0)", [
					json,
					"previousFrom",
					"previousUntil",
				]),
				previousPeakKw: ofZone<number>("coalesce(max(r.peak_kw), 0)", [
					json,
					"previousFrom",
					"previousUntil",
				]),
				kwhToday: ofZone<number>("coalesce(sum(r.kwh), 0)", [json, "todayFrom", "until"]),
			})
			.from(energyZone)
			.where(ofZones),
		// kWh per zone per hour (UTC): the buckets are made of them in the site's zone. A cross join,
		// which SQLite keeps in its order: each zone, then its readings by a seek between its site's
		// moments (else it reads every reading the zones ever had, by the tenant's index).
		db
			.select({
				zoneId: energyReading.zoneId,
				hour: sql<number>`${start} / 3600`,
				kwh: sql<number>`sum(${energyReading.kwh})`,
			})
			.from(energyZone)
			.crossJoin(energyReading)
			.where(
				and(
					ofZones,
					sameTenant(energyReading, energyZone),
					eq(energyReading.zoneId, energyZone.id),
					sql`${start} >= ${bound(json, "previousFrom")}`,
					sql`${start} < ${bound(json, "to")}`,
				),
			)
			.groupBy(energyReading.zoneId, sql`${start} / 3600`),
	]);
	const sumOf = new Map(sums.map(({ zoneId, ...sum }) => [zoneId, sum]));
	const hoursOf = Map.groupBy(hourly, (row) => row.zoneId);

	return sites.map((of) => {
		const own = zones.filter((zone) => zone.siteId === of.site.id);
		// The readings go back to the previous period's first hour: else it's no comparison (a site
		// whose readings start in the middle of last month).
		const first = Math.min(...own.map((zone) => zone.first).filter((start) => start !== null));
		return {
			zones: own.map((zone) =>
				shapeZone(zone, sumOf.get(zone.id) ?? noSums, hoursOf.get(zone.id) ?? [], of, now),
			),
			previousComplete: first <= momentSeconds(of.ranges.previousFrom.add({ hours: 1 })),
		};
	});
}

/** Each of the sites' doors (those `where` picks, of `energyDoor`; all without) over its ranges, at `now`. */
export async function doorFigures(sites: SiteRanges[], now: Temporal.Instant, where?: SQL) {
	if (!sites.length) return [];
	const doors = await db
		.select({
			id: energyDoor.id,
			siteId: energyDoor.energySiteId,
			code: energyDoor.code,
			name: energyDoor.name,
			kind: energyDoor.kind,
			zoneId: energyDoor.zoneId,
			lossKw: energyDoor.lossKw,
			thresholdMinutes: energyDoor.thresholdMinutes,
			insideC: energyDoor.insideC,
			outsideC: energyDoor.outsideC,
			equipmentId: energyDoor.equipmentId,
			serialNumber: equipment.serialNumber,
			unitName: equipment.name,
		})
		.from(energyDoor)
		.leftJoin(...tenantJoin(equipment, energyDoor.equipmentId))
		.where(
			and(
				inTenant(energyDoor),
				inList(
					energyDoor.energySiteId,
					sites.map(({ site }) => site.id),
				),
				where,
			),
		)
		.orderBy(asc(energyDoor.code));
	// With the opening a door was in when its previous period began, however long ago it opened:
	// a read per moment the sites' previous periods begin at (one, unless their time zones differ).
	const windows = Map.groupBy(doors, (door) =>
		sites.find(({ site }) => site.id === door.siteId)!.ranges.previousFrom.toString(),
	);
	const events = (
		await Promise.all(
			[...windows].map(([from, inWindow]) =>
				doorEvents(
					db,
					inWindow.map((door) => door.id),
					Temporal.Instant.from(from),
					now,
				),
			),
		)
	).flat();
	const eventsOf = Map.groupBy(events, (event) => event.doorId);

	return sites.map(({ site, ranges }) => {
		const end = earlier(ranges.to, now);
		return doors
			.filter((door) => door.siteId === site.id)
			.map((door) => {
				const own = openings(eventsOf.get(door.id) ?? []);
				const last = own.at(-1);
				const openedAt = last && !last.closedAt ? last.openedAt : null;
				const minutesOpen = last && openedAt ? openMinutes(last, now) : 0;
				const loss = (from: Temporal.Instant, to: Temporal.Instant) =>
					doorLossKwh(minutesOpenBetween(own, from, to), door.lossKw);
				return {
					id: door.id,
					code: door.code,
					name: door.name,
					kind: door.kind,
					zoneId: door.zoneId,
					lossKw: door.lossKw,
					thresholdMinutes: door.thresholdMinutes,
					insideC: door.insideC,
					outsideC: door.outsideC,
					equipmentId: door.equipmentId,
					unit: door.serialNumber ? { serialNumber: door.serialNumber, name: door.unitName } : null,
					openedAt,
					minutesOpen,
					overdue: openedAt !== null && isOverdue(minutesOpen, door.thresholdMinutes),
					lossKwh: loss(ranges.from, end),
					previousLossKwh: loss(ranges.previousFrom, ranges.previousTo),
					lossKwhToday: loss(ranges.today, now),
					openingsToday: own.filter((o) => Temporal.Instant.compare(o.openedAt, ranges.today) >= 0)
						.length,
				};
			});
	});
}

/**
 * The site's consumers ("installaties"), by zone, in their order (those in `zoneId`, if given),
 * each with the unit it is, if it's one.
 */
export function siteConsumers(siteId: number, zoneId?: number) {
	return db
		.select({
			id: energyConsumer.id,
			zoneId: energyConsumer.zoneId,
			name: energyConsumer.name,
			ratedKw: energyConsumer.ratedKw,
			equipmentId: energyConsumer.equipmentId,
			serialNumber: equipment.serialNumber,
			unitName: equipment.name,
		})
		.from(energyConsumer)
		.innerJoin(...tenantJoin(energyZone, energyConsumer.zoneId))
		.leftJoin(...tenantJoin(equipment, energyConsumer.equipmentId))
		.where(
			and(
				inTenant(energyConsumer),
				eq(energyZone.energySiteId, siteId),
				zoneId === undefined ? undefined : eq(energyConsumer.zoneId, zoneId),
			),
		)
		.orderBy(asc(energyZone.position), asc(energyConsumer.position), asc(energyConsumer.id));
}

/** A door's figures over the period. */
export type DoorFigures = Awaited<ReturnType<typeof doorFigures>>[number][number];

/** How many of the site's alerts are open. */
export async function openAlertCount(siteId: number) {
	return (await openAlertCounts([siteId])).get(siteId) ?? 0;
}

/** How many of each of the sites' alerts are open (none: not in the map). */
export async function openAlertCounts(siteIds: number[]) {
	const counts = await db
		.select({ siteId: energyAlert.energySiteId, count: sql<number>`count(*)` })
		.from(energyAlert)
		.where(
			and(
				inTenant(energyAlert),
				inList(energyAlert.energySiteId, siteIds),
				eq(energyAlert.status, "open"),
			),
		)
		.groupBy(energyAlert.energySiteId);
	return new Map(counts.map((row) => [row.siteId, row.count]));
}
