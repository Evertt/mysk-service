/**
 * Energy's part of the demo's simulation (`simulation.run`, `#lib/simulation/extensions.ts`), for
 * an organization that's offered one (SHLTR): its P1 meters and door sensors, made up while the
 * simulation runs, and posted through the module's own ingest (`parseBatch()` and `storeBatch()`,
 * as `POST /energy/ingest` stores a gateway's batch), so the readings, door events, first
 * thresholds and alerts are the real path's, and only the source changes when the real P1 link
 * comes. Runs as the system in the tenant.
 *
 * - `tick` posts, for each of the tenant's sites, every 15-minute interval that has ended since
 *   the site's latest reading (at most a day back, so a pause leaves no gap and no zone goes
 *   offline), and each door's openings and closings in the tick's interval, going on from its
 *   latest event (`../simulation.ts`: §2.5's working day, surges that cross thresholds, doors left
 *   open too long; livelier at a higher speed).
 * - `reset` puts yesterday and today back as the seed has them: the seed's own simulation
 *   (`simulateDay()`) posted again up to now, the doors' events since yesterday replaced, and the
 *   open alerts gone (the ingest raises the day's again); alerts that became orders or were
 *   resolved stay, as do the thresholds, which are the managers' settings.
 *
 * Riedel's zones and doors simulate as the seed's (`riedel.ts`); another site's from what it has:
 * a zone's peak and day from its thresholds (or its consumers' rated power), a door's cycle by its
 * kind and threshold.
 */
import { and, eq, getTableName, gte, sql } from "drizzle-orm";

import { currentTenant, inTenant } from "#lib/server/auth/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import type { Simulation, SimulationTick } from "#lib/simulation/extensions.ts";

import { MAX_READINGS, parseBatch } from "../ingest/format.ts";
import { INTERVAL_MINUTES, type DoorKind } from "../model.ts";
import {
	type DoorState,
	simulateDay,
	simulateDoorEvents,
	simulateReadings,
	type SimulatedDoor,
	type SimulatedZone,
} from "../simulation.ts";
import { storeBatch } from "./ingest.ts";
import { riedelDoors, riedelZones, SIMULATION_SEED } from "./riedel.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyDoorEvent,
	energySite,
	energyThreshold,
	energyZone,
} from "./schema.ts";
import { zoneThresholds } from "./thresholds.ts";

/** How far back a tick fills the readings a pause left out. */
const FILL_HOURS = 24;

/** A door's cycle by its kind, for a door the demo doesn't know. */
const doorDefaults: Record<DoorKind, Omit<SimulatedDoor, "code" | "overrunMinutes">> = {
	sectional: {
		cycleMinutes: 45,
		openMinutes: 6,
		offsetMinutes: 0,
		fromHour: 6,
		toHour: 22,
		overrunChance: 0.08,
	},
	freezer: {
		cycleMinutes: 35,
		openMinutes: 2,
		offsetMinutes: 0,
		fromHour: 6,
		toHour: 20,
		overrunChance: 0.06,
	},
	cold: {
		cycleMinutes: 40,
		openMinutes: 3,
		offsetMinutes: 0,
		fromHour: 6,
		toHour: 20,
		overrunChance: 0.06,
	},
};

/** A site as the simulation runs it: its zones and doors, and the latest of their data. */
async function simulatedSites() {
	const sites = await db
		.select({ id: energySite.id, timeZone: energySite.timeZone })
		.from(energySite)
		.where(inTenant(energySite))
		.orderBy(energySite.id);
	if (!sites.length) return [];
	const siteIds = sites.map((site) => site.id);
	const [zones, rated, doors, latestReadings, latestEvents] = await Promise.all([
		db
			.select({
				id: energyZone.id,
				site: energyZone.energySiteId,
				code: energyZone.code,
				maxKw: energyThreshold.maxKw,
				maxKwh: energyThreshold.maxKwh,
			})
			.from(energyZone)
			.leftJoin(...zoneThresholds())
			.where(and(inTenant(energyZone), inList(energyZone.energySiteId, siteIds))),
		db
			.select({ zoneId: energyConsumer.zoneId, kw: sql<number>`sum(${energyConsumer.ratedKw})` })
			.from(energyConsumer)
			.where(inTenant(energyConsumer))
			.groupBy(energyConsumer.zoneId),
		db
			.select({
				id: energyDoor.id,
				site: energyDoor.energySiteId,
				code: energyDoor.code,
				kind: energyDoor.kind,
				thresholdMinutes: energyDoor.thresholdMinutes,
			})
			.from(energyDoor)
			.where(and(inTenant(energyDoor), inList(energyDoor.energySiteId, siteIds))),
		// Each zone's latest interval and each door's latest event, by a seek per zone and door. The
		// zone's id by its table's name: drizzle writes the columns of a select of one table bare, and
		// a bare `id` in the subquery would be the reading's, if it had one.
		db
			.select({
				zoneId: energyZone.id,
				start: sql<number | null>`(select max(r.start) from energy_reading r
					where r.zone_id = ${sql.identifier(getTableName(energyZone))}.id)`,
			})
			.from(energyZone)
			.where(and(inTenant(energyZone), inList(energyZone.energySiteId, siteIds))),
		db
			.select({
				doorId: energyDoorEvent.doorId,
				at: energyDoorEvent.at,
				open: energyDoorEvent.open,
			})
			.from(energyDoor)
			.innerJoin(
				energyDoorEvent,
				and(
					eq(energyDoorEvent.doorId, energyDoor.id),
					sql`${energyDoorEvent.at} = (select max(e.at) from energy_door_event e where e.door_id = ${energyDoor.id})`,
				),
			)
			.where(
				and(
					inTenant(energyDoor),
					inTenant(energyDoorEvent),
					inList(energyDoor.energySiteId, siteIds),
				),
			),
	]);
	return sites.map((site) => {
		const own = zones.filter((zone) => zone.site === site.id);
		const latest = latestReadings
			.filter((row) => own.some((zone) => zone.id === row.zoneId))
			.flatMap((row) => (row.start === null ? [] : [row.start]));
		return {
			...site,
			zones: own.flatMap((zone): SimulatedZone[] => {
				const known = riedelZones.find((each) => each.code === zone.code);
				if (known) return [known];
				// As a nominal zone's thresholds have it (§2.5's 1.3), else its consumers' at 60 %.
				const ratedKw = rated.find((row) => row.zoneId === zone.id)?.kw ?? 0;
				const peakKw = zone.maxKw ? zone.maxKw / 1.3 : ratedKw * 0.6;
				const kwhPerDay = zone.maxKwh ? zone.maxKwh / 1.3 : peakKw * 24 * 0.35;
				return peakKw > 0 ? [{ code: zone.code, peakKw, kwhPerDay }] : [];
			}),
			doors: doors
				.filter((door) => door.site === site.id)
				.map((door) => ({
					id: door.id,
					simulated: riedelDoors.find((each) => each.code === door.code) ?? {
						code: door.code,
						...doorDefaults[door.kind],
						overrunMinutes: door.thresholdMinutes + 3,
					},
					state:
						latestEvents
							.filter((event) => event.doorId === door.id)
							.map((event): DoorState => ({ open: event.open, since: event.at }))
							.at(0) ?? null,
				})),
			/** The end of the site's latest reading, if any. */
			readingsUntil: latest.length
				? Temporal.Instant.fromEpochMilliseconds(
						(Math.max(...latest) + INTERVAL_MINUTES * 60) * 1000,
					)
				: null,
		};
	});
}

interface Posted {
	readings: { zone: string; start: Temporal.Instant; avgKw: number; peakKw: number; kwh: number }[];
	doorEvents: { door: string; at: Temporal.Instant; open: boolean }[];
}

/**
 * Posts a site's made-up readings and door events through the ingest, as a gateway's batches (at
 * most `MAX_READINGS` readings each, the door events with the last), as of `now`.
 */
async function post(siteId: number, { readings, doorEvents }: Posted, now: Temporal.Instant) {
	const chunks: Posted[] = [];
	for (let i = 0; i < readings.length; i += MAX_READINGS) {
		chunks.push({ readings: readings.slice(i, i + MAX_READINGS), doorEvents: [] });
	}
	if (!chunks.length) chunks.push({ readings: [], doorEvents: [] });
	chunks.at(-1)!.doorEvents = doorEvents;
	for (const chunk of chunks) {
		if (!chunk.readings.length && !chunk.doorEvents.length) continue;
		// As a gateway's JSON, through the endpoint's own checks.
		const body = {
			site: siteId,
			readings: chunk.readings.map((r) => ({ ...r, start: r.start.toString() })),
			doorEvents: chunk.doorEvents.map((e) => ({
				door: e.door,
				at: e.at.toString(),
				state: e.open ? "open" : "closed",
			})),
		};
		const parsed = parseBatch(body, now);
		if (parsed.issues) throw new Error(`The simulation's batch: ${parsed.issues.join("; ")}`);
		await storeBatch(parsed.batch, now);
	}
}

const earlier = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) <= 0 ? a : b;
const laterOf = (a: Temporal.Instant, b: Temporal.Instant) =>
	Temporal.Instant.compare(a, b) >= 0 ? a : b;

/** Moves the tenant's sites on over `(from, to]` (see above). */
async function tickEnergy({ from, to, speed }: SimulationTick) {
	for (const site of await simulatedSites()) {
		const fillFrom = laterOf(site.readingsUntil ?? from, to.subtract({ hours: FILL_HOURS }));
		const readings = simulateReadings({
			zones: site.zones,
			from: earlier(from, fillFrom),
			to,
			timeZone: site.timeZone,
			seed: SIMULATION_SEED,
			speed,
		});
		// A door without events yet is closed since the day began: a fixed moment, so the ticks
		// agree on when it first opens.
		const dayStart = from.toZonedDateTimeISO(site.timeZone).startOfDay().toInstant();
		const doorEvents = site.doors.flatMap((door) =>
			simulateDoorEvents({
				door: door.simulated,
				state: door.state ?? { open: false, since: dayStart },
				from,
				to,
				timeZone: site.timeZone,
				seed: SIMULATION_SEED,
				speed,
			}),
		);
		await post(site.id, { readings, doorEvents }, to);
	}
}

/** Puts yesterday and today back as the seed has them (see above). */
async function resetEnergy() {
	const now = Temporal.Now.instant();
	for (const site of await simulatedSites()) {
		const today = now.toZonedDateTimeISO(site.timeZone).toPlainDate();
		const yesterday = today.subtract({ days: 1 });
		const since = yesterday.toZonedDateTime({ timeZone: site.timeZone }).toInstant();
		const doorIds = site.doors.map((door) => door.id);
		await db.transaction(async (tx) => {
			if (doorIds.length) {
				await tx
					.delete(energyDoorEvent)
					.where(
						and(
							inTenant(energyDoorEvent),
							inList(energyDoorEvent.doorId, doorIds),
							gte(energyDoorEvent.at, since),
						),
					);
			}
			await tx
				.delete(energyAlert)
				.where(
					and(
						inTenant(energyAlert),
						eq(energyAlert.energySiteId, site.id),
						eq(energyAlert.status, "open"),
					),
				);
			const { organizationId } = currentTenant();
			afterCommit(() => announceChange(organizationId, "energy_alert", { action: "deleted" }));
		});
		const posted: Posted = { readings: [], doorEvents: [] };
		for (const day of [yesterday, today]) {
			const simulated = simulateDay({
				zones: site.zones,
				doors: site.doors.map((door) => door.simulated),
				day,
				timeZone: site.timeZone,
				seed: SIMULATION_SEED,
				until: now,
			});
			posted.readings.push(...simulated.readings);
			posted.doorEvents.push(...simulated.doorEvents);
		}
		await post(site.id, posted, now);
	}
}

/** Energy's simulation, for `simulated()`. */
export const energySimulation: Simulation = { tick: tickEnergy, reset: resetEnergy };
