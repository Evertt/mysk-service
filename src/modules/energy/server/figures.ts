/**
 * A site's figures over a period and the one before it, from its readings and door events, in
 * SQL aggregates where they can be (a period's sums and peaks per zone, kWh per zone per hour) and
 * with the pure rules of `../model.ts` for the rest (live power, states, tones, door loss): what
 * the site's page, a zone's page and the report show. Days and hours are the site's own (its time
 * zone), so "today" is the building's.
 */
import { error } from "@sveltejs/kit";
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";

import { inTenant, idInTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment } from "#lib/server/db/schema.ts";

import {
	doorLossKwh,
	type DoorKind,
	isOffline,
	isOverdue,
	minutesOpenBetween,
	openings,
	openMinutes,
	type Period,
	type ThresholdState,
	thresholdRatio,
	thresholdState,
	type ZoneTone,
	zoneTone,
} from "../model.ts";
import {
	energyAlert,
	energyDoor,
	energyDoorEvent,
	energyReading,
	energySite,
	energyThreshold,
	energyZone,
} from "./schema.ts";

/** The current tenant's site `id` with its customer, or a 404. */
export async function loadSite(id: number) {
	const [found] = await db
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
		.where(idInTenant(energySite, id));
	if (!found) error(404, m.energy_site_not_found());
	return found;
}

export type EnergySite = Awaited<ReturnType<typeof loadSite>>;

/** The moments a period's figures span. */
interface Ranges {
	/** The period so far: from its start (a local midnight) to now (or its end). */
	from: Temporal.Instant;
	to: Temporal.Instant;
	/** The period before it, whole (its chart), and as far into it as the current one is (its sums). */
	previousFrom: Temporal.Instant;
	previousEnd: Temporal.Instant;
	previousTo: Temporal.Instant;
	/** Today's start at the site, for the thresholds, which are per day. */
	today: Temporal.Instant;
	/** How a chart's buckets go: hours of the day, or days. */
	bucket: "hour" | "day";
	/** How many buckets the current period's chart has. */
	buckets: number;
}

const startOf = (day: Temporal.PlainDate, timeZone: string) =>
	day.toZonedDateTime({ timeZone }).toInstant();

const earlier = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) <= 0 ? a : b;

/** Today against yesterday, or this month against last month, at `now` in `timeZone`. */
export function periodRanges(period: Period, timeZone: string, now: Temporal.Instant): Ranges {
	const day = now.toZonedDateTimeISO(timeZone).toPlainDate();
	const today = startOf(day, timeZone);
	if (period === "day") {
		const previousFrom = startOf(day.subtract({ days: 1 }), timeZone);
		return {
			from: today,
			to: now,
			previousFrom,
			previousEnd: today,
			previousTo: earlier(previousFrom.add(now.since(today)), today),
			today,
			bucket: "hour",
			buckets: 24,
		};
	}
	const first = day.with({ day: 1 });
	const from = startOf(first, timeZone);
	const previousFrom = startOf(first.subtract({ months: 1 }), timeZone);
	return {
		from,
		to: now,
		previousFrom,
		previousEnd: from,
		previousTo: earlier(previousFrom.add(now.since(from)), from),
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
	return {
		from,
		to,
		previousFrom,
		previousEnd: from,
		previousTo: earlier(previousFrom.add(to.since(from)), from),
		today: startOf(now.toZonedDateTimeISO(timeZone).toPlainDate(), timeZone),
		bucket: days === 1 ? "hour" : "day",
		buckets: days === 1 ? 24 : days,
	};
}

/** A zone's figures over the period. */
export interface ZoneFigures {
	id: number;
	code: string;
	name: string;
	floor: string | null;
	areaM2: number;
	/** Its latest interval's average, 0 while offline. */
	liveKw: number;
	latestAt: Temporal.Instant | null;
	offline: boolean;
	kwh: number;
	previousKwh: number;
	peakKw: number;
	previousPeakKw: number;
	kwhToday: number;
	threshold: { enabled: boolean; maxKw: number; maxKwh: number } | null;
	ratio: number;
	state: ThresholdState;
	tone: ZoneTone;
	/** kWh per bucket of the period, and of the one before. */
	series: number[];
	previousSeries: number[];
}

/** A door's figures over the period. */
export interface DoorFigures {
	id: number;
	code: string;
	name: string;
	kind: DoorKind;
	zoneId: number;
	lossKw: number;
	thresholdMinutes: number;
	insideC: number | null;
	outsideC: number | null;
	equipmentId: number | null;
	unit: { serialNumber: string; name: string | null } | null;
	/** Since when it's open, if it is. */
	openedAt: Temporal.Instant | null;
	minutesOpen: number;
	overdue: boolean;
	lossKwh: number;
	previousLossKwh: number;
	lossKwhToday: number;
	openingsToday: number;
}

const seconds = (instant: Temporal.Instant) => Math.floor(instant.epochMilliseconds / 1000);

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

/** The site's zones and doors over `ranges` (see above), at `now`. */
export async function siteFigures(site: EnergySite, ranges: Ranges, now: Temporal.Instant) {
	const zones = await db
		.select({
			id: energyZone.id,
			code: energyZone.code,
			name: energyZone.name,
			floor: energyZone.floor,
			areaM2: energyZone.areaM2,
			enabled: energyThreshold.enabled,
			maxKw: energyThreshold.maxKw,
			maxKwh: energyThreshold.maxKwh,
		})
		.from(energyZone)
		.leftJoin(energyThreshold, eq(energyThreshold.zoneId, energyZone.id))
		.where(and(inTenant(energyZone), eq(energyZone.energySiteId, site.id)))
		.orderBy(asc(energyZone.position), asc(energyZone.id));
	const zoneIds = zones.map((zone) => zone.id);
	const { from, to, previousFrom, previousTo, previousEnd, today } = ranges;
	const start = energyReading.start;
	const inZones = and(inTenant(energyReading), inList(energyReading.zoneId, zoneIds));

	const [sums, hourly, latest, [first]] = await Promise.all([
		db
			.select({
				zoneId: energyReading.zoneId,
				kwh: sql<number>`coalesce(sum(case when ${start} >= ${seconds(from)} and ${start} < ${seconds(to)} then ${energyReading.kwh} end), 0)`,
				previousKwh: sql<number>`coalesce(sum(case when ${start} >= ${seconds(previousFrom)} and ${start} < ${seconds(previousTo)} then ${energyReading.kwh} end), 0)`,
				peakKw: sql<number>`coalesce(max(case when ${start} >= ${seconds(from)} and ${start} < ${seconds(to)} then ${energyReading.peakKw} end), 0)`,
				previousPeakKw: sql<number>`coalesce(max(case when ${start} >= ${seconds(previousFrom)} and ${start} < ${seconds(previousTo)} then ${energyReading.peakKw} end), 0)`,
				kwhToday: sql<number>`coalesce(sum(case when ${start} >= ${seconds(today)} then ${energyReading.kwh} end), 0)`,
			})
			.from(energyReading)
			.where(and(inZones, gte(start, previousFrom), lt(start, earlier(to, now))))
			.groupBy(energyReading.zoneId),
		// kWh per zone per hour (UTC): the buckets are made of them in the site's zone.
		db
			.select({
				zoneId: energyReading.zoneId,
				hour: sql<number>`${start} / 3600`,
				kwh: sql<number>`sum(${energyReading.kwh})`,
			})
			.from(energyReading)
			.where(and(inZones, gte(start, previousFrom), lt(start, to)))
			.groupBy(energyReading.zoneId, sql`${start} / 3600`),
		db
			.select({ zoneId: energyReading.zoneId, start, avgKw: energyReading.avgKw })
			.from(energyReading)
			.where(
				and(
					inZones,
					sql`${start} = (select max(r.start) from energy_reading r where r.zone_id = ${energyReading.zoneId})`,
				),
			),
		db
			.select({ start: sql<number | null>`min(${start})` })
			.from(energyReading)
			.where(inZones),
	]);
	// The readings go back to the previous period's first hour: else it's no comparison (a site
	// whose readings start in the middle of last month).
	const previousComplete =
		first?.start != null && first.start <= seconds(previousFrom.add({ hours: 1 }));

	const previousBuckets =
		ranges.bucket === "hour"
			? 24
			: previousFrom
					.toZonedDateTimeISO(site.timeZone)
					.toPlainDate()
					.until(previousEnd.toZonedDateTimeISO(site.timeZone).toPlainDate()).days;
	const zoneFigures: ZoneFigures[] = zones.map((zone) => {
		const sum = sums.find((row) => row.zoneId === zone.id);
		const last = latest.find((row) => row.zoneId === zone.id);
		const offline = isOffline(last?.start, now);
		const liveKw = offline || !last ? 0 : last.avgKw;
		const kwhToday = sum?.kwhToday ?? 0;
		const threshold =
			zone.enabled === null
				? null
				: { enabled: zone.enabled, maxKw: zone.maxKw!, maxKwh: zone.maxKwh! };
		const { ratio } = threshold
			? thresholdRatio({ kw: liveKw, kwh: kwhToday }, threshold)
			: { ratio: 0 };
		const state = threshold && !offline ? thresholdState(ratio, threshold.enabled) : "off";
		const series = Array.from({ length: ranges.buckets }, () => 0);
		const previousSeries = Array.from({ length: previousBuckets }, () => 0);
		for (const row of hourly) {
			if (row.zoneId !== zone.id) continue;
			const at = Temporal.Instant.fromEpochMilliseconds(row.hour * 3600 * 1000);
			const current = Temporal.Instant.compare(at, from) >= 0;
			const index = bucketOf(at, current ? from : previousFrom, ranges, site.timeZone);
			const target = current ? series : previousSeries;
			if (index >= 0 && index < target.length) target[index] += row.kwh;
		}
		return {
			id: zone.id,
			code: zone.code,
			name: zone.name,
			floor: zone.floor,
			areaM2: zone.areaM2,
			liveKw,
			latestAt: last?.start ?? null,
			offline,
			kwh: sum?.kwh ?? 0,
			previousKwh: sum?.previousKwh ?? 0,
			peakKw: sum?.peakKw ?? 0,
			previousPeakKw: sum?.previousPeakKw ?? 0,
			kwhToday,
			threshold,
			ratio,
			state,
			tone: zoneTone(offline, state),
			series,
			previousSeries,
		};
	});

	return { zones: zoneFigures, doors: await doorFigures(site, ranges, now), previousComplete };
}

/** The site's doors over `ranges`, at `now`. */
async function doorFigures(
	site: EnergySite,
	ranges: Ranges,
	now: Temporal.Instant,
): Promise<DoorFigures[]> {
	const doors = await db
		.select({
			id: energyDoor.id,
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
		.where(and(inTenant(energyDoor), eq(energyDoor.energySiteId, site.id)))
		.orderBy(asc(energyDoor.code));
	if (!doors.length) return [];
	// A day before the previous period, to pair an opening that started before it.
	const events = await db
		.select({ doorId: energyDoorEvent.doorId, at: energyDoorEvent.at, open: energyDoorEvent.open })
		.from(energyDoorEvent)
		.where(
			and(
				inTenant(energyDoorEvent),
				inList(
					energyDoorEvent.doorId,
					doors.map((door) => door.id),
				),
				gte(energyDoorEvent.at, ranges.previousFrom.subtract({ hours: 24 })),
				lt(energyDoorEvent.at, now),
			),
		);
	const end = earlier(ranges.to, now);
	return doors.map((door) => {
		const own = openings(events.filter((event) => event.doorId === door.id));
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
}

/** How many of the site's alerts are open. */
export async function openAlertCount(siteId: number) {
	const [row] = await db
		.select({ count: sql<number>`count(*)` })
		.from(energyAlert)
		.where(
			and(
				inTenant(energyAlert),
				eq(energyAlert.energySiteId, siteId),
				eq(energyAlert.status, "open"),
			),
		);
	return row?.count ?? 0;
}
