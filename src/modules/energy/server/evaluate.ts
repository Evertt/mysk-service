/**
 * Raising alerts after a batch (`ingest.ts`), in its transaction: the site's zones that got
 * readings against their thresholds, interval by interval (power, and the day's consumption up to
 * it), and every door of the site by its openings, still-open ones up to now (`../model.ts`). A
 * breach becomes an alert once per key (a zone's power per local hour, its consumption per local
 * day, a door per opening); a door's alert that's still open follows its opening as it goes on (the
 * longest it was open), a zone's grows from near to active within its hour or day. Only the last day's breaches raise alerts: a gateway catching up
 * on last week raises none about it, while a door that's still open (since last week) does.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import type { Transaction } from "#lib/server/db/index.ts";
import { inList, insertBatches } from "#lib/server/db/parameters.ts";

import {
	type Breach,
	doorBreaches,
	INTERVAL_MINUTES,
	openings,
	zoneBreaches,
	type ZoneInterval,
} from "../model.ts";
import { doorEvents } from "./door-events.ts";
import { energyAlert, energyDoor, energyReading, energyThreshold, energyZone } from "./schema.ts";

/** How far back a breach still raises an alert. */
const ALERT_WINDOW_HOURS = 24;

/**
 * The local day and hour a moment is in at the site, `yyyy-mm-dd` and `yyyy-mm-ddThh`: what a
 * zone's alerts are keyed by.
 */
function localDayAndHour(instant: Temporal.Instant, timeZone: string) {
	const local = instant.toZonedDateTimeISO(timeZone);
	const day = local.toPlainDate().toString();
	return { day, hour: `${day}T${String(local.hour).padStart(2, "0")}` };
}

/** A breach with what it's about. */
type Raised = Breach & { zoneId: number; doorId: number | null; code: string };

/** The zones' breaches over the intervals that came in (`starts`), with the days they're in. */
async function zoneBreachesOf(
	tx: Transaction,
	site: { id: number; timeZone: string },
	zoneIds: number[],
	starts: Temporal.Instant[],
): Promise<Raised[]> {
	if (!zoneIds.length || !starts.length) return [];
	const sorted = starts.toSorted((a, b) => Temporal.Instant.compare(a, b));
	// From the first one's local midnight: the day's consumption so far counts.
	const from = sorted[0].toZonedDateTimeISO(site.timeZone).startOfDay().toInstant();
	const to = sorted.at(-1)!;
	const [readings, thresholds, zones] = await Promise.all([
		tx
			.select({
				zoneId: energyReading.zoneId,
				start: energyReading.start,
				avgKw: energyReading.avgKw,
				kwh: energyReading.kwh,
			})
			.from(energyReading)
			.where(
				and(
					inTenant(energyReading),
					inList(energyReading.zoneId, zoneIds),
					gte(energyReading.start, from),
					lte(energyReading.start, to),
				),
			)
			.orderBy(asc(energyReading.zoneId), asc(energyReading.start)),
		tx
			.select()
			.from(energyThreshold)
			.where(and(inTenant(energyThreshold), inList(energyThreshold.zoneId, zoneIds))),
		tx
			.select({ id: energyZone.id, code: energyZone.code })
			.from(energyZone)
			.where(and(inTenant(energyZone), inList(energyZone.id, zoneIds))),
	]);
	const incoming = new Set(starts.map((start) => start.epochMilliseconds));
	const raised: Raised[] = [];
	for (const zone of zones) {
		const threshold = thresholds.find((t) => t.zoneId === zone.id);
		if (!threshold) continue;
		const intervals: ZoneInterval[] = [];
		let today = "";
		let kwhToday = 0;
		for (const reading of readings) {
			if (reading.zoneId !== zone.id) continue;
			const { day, hour } = localDayAndHour(reading.start, site.timeZone);
			if (day !== today) [today, kwhToday] = [day, 0];
			kwhToday += reading.kwh;
			// Only the batch's intervals are judged; the earlier ones of the day add up to them.
			if (!incoming.has(reading.start.epochMilliseconds)) continue;
			intervals.push({ start: reading.start, day, hour, kw: reading.avgKw, kwhToday });
		}
		for (const breach of zoneBreaches(zone.id, intervals, threshold)) {
			raised.push({ ...breach, zoneId: zone.id, doorId: null, code: zone.code });
		}
	}
	return raised;
}

/**
 * The site's doors' breaches: their openings of the last day, with the one a door was in when it
 * began, however long ago it opened (`door-events.ts`).
 */
async function doorBreachesOf(
	tx: Transaction,
	site: { id: number },
	now: Temporal.Instant,
): Promise<Raised[]> {
	const doors = await tx
		.select({
			id: energyDoor.id,
			code: energyDoor.code,
			zoneId: energyDoor.zoneId,
			thresholdMinutes: energyDoor.thresholdMinutes,
		})
		.from(energyDoor)
		.where(and(inTenant(energyDoor), eq(energyDoor.energySiteId, site.id)));
	const events = await doorEvents(
		tx,
		doors.map((door) => door.id),
		now.subtract({ hours: ALERT_WINDOW_HOURS }),
	);
	return doors.flatMap((door) =>
		doorBreaches(
			door.id,
			openings(events.filter((event) => event.doorId === door.id)),
			door.thresholdMinutes,
			now,
		).map((breach) => ({ ...breach, zoneId: door.zoneId, doorId: door.id, code: door.code })),
	);
}

/**
 * When a breach was last going on: a zone's at its interval's end, a door's at its opening's (its
 * close, or now while it's open; `at` is when it opened, `measured` its minutes open since). So a
 * door open since long before the window still raises its alert, once.
 */
const lastBreached = (breach: Breach) =>
	breach.metric === "door"
		? breach.at.add({ milliseconds: Math.round(breach.measured * 60_000) })
		: breach.at.add({ minutes: INTERVAL_MINUTES });

/**
 * Raises the alerts of the breaches since a batch (see above), in `tx`, and logs each new one as
 * the system's. Returns how many it raised.
 */
export async function raiseAlerts(
	tx: Transaction,
	site: { id: number; name: string; timeZone: string },
	batch: { zoneIds: number[]; starts: Temporal.Instant[]; now: Temporal.Instant },
): Promise<number> {
	const since = batch.now.subtract({ hours: ALERT_WINDOW_HOURS });
	const breaches = [
		...(await zoneBreachesOf(tx, site, batch.zoneIds, batch.starts)),
		...(await doorBreachesOf(tx, site, batch.now)),
	].filter((breach) => Temporal.Instant.compare(lastBreached(breach), since) >= 0);
	if (!breaches.length) return 0;

	const existing = await tx
		.select({
			id: energyAlert.id,
			key: energyAlert.key,
			severity: energyAlert.severity,
			measured: energyAlert.measured,
			status: energyAlert.status,
		})
		.from(energyAlert)
		.where(
			and(
				inTenant(energyAlert),
				inList(
					energyAlert.key,
					breaches.map((breach) => breach.key),
				),
			),
		);
	const byKey = new Map(existing.map((alert) => [alert.key, alert]));

	// An open alert follows its breach: a door open for longer, a zone from near to over (within its
	// hour for power, its day for consumption).
	for (const breach of breaches) {
		const alert = byKey.get(breach.key);
		if (!alert || alert.status !== "open") continue;
		const worse =
			breach.metric === "door"
				? breach.measured > alert.measured + 0.5
				: alert.severity === "near" && breach.severity === "active";
		if (!worse) continue;
		await tx
			.update(energyAlert)
			.set({
				severity: breach.severity,
				measured: breach.measured,
				threshold: breach.threshold,
				metric: breach.metric,
				at: breach.at,
			})
			.where(and(eq(energyAlert.id, alert.id), inTenant(energyAlert)));
	}

	const fresh = breaches.filter((breach) => !byKey.has(breach.key));
	if (!fresh.length) return 0;
	const { organizationId } = currentTenant();
	const rows = fresh.map(({ code: _code, ...breach }) => ({
		organizationId,
		energySiteId: site.id,
		...breach,
	}));
	const created: { id: number; key: string }[] = [];
	for (const batch of insertBatches(energyAlert, rows)) {
		created.push(
			...(await tx
				.insert(energyAlert)
				.values(batch)
				.returning({ id: energyAlert.id, key: energyAlert.key })),
		);
	}
	const codeOf = new Map(fresh.map((breach) => [breach.key, breach.code]));
	for (const alert of created) {
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_alert", id: alert.id, label: codeOf.get(alert.key)! },
			parent: { type: "energy_site", id: site.id, label: site.name },
		});
	}
	return created.length;
}
