/**
 * The energy module's demo data: SHLTR's "Riedel Ede — Productielocatie" (§2.5, `riedel.ts`) with
 * its eight zones, eleven consumers and five doors (D-07 linked to the unit of the demo's timeline, the freezer's door and the dock lift linked to
 * Riedel's units), each zone's default thresholds, 30 days of history and today's readings so far
 * (15-minute aggregates per zone, from the simulation the simulator posts too, so a day posted
 * again changes nothing), the doors' events, a few open alerts from the last day and the token the
 * simulator posts with. Only SHLTR has the module. The simulation's own random numbers, so the rest
 * of the demo data is the same with or without it.
 */
import { and, eq } from "drizzle-orm";

import { withTenantRefs } from "#lib/server/db/columns.ts";
import { insertRows } from "#lib/server/db/parameters.ts";
import { customer, customerSite, equipment } from "#lib/server/db/schema.ts";
import { now } from "#lib/server/db/seed/clock.ts";
import { seedIntegrationToken } from "#lib/server/db/seed/integrations.ts";
import { defineSeed, type SeedTransaction } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";
import { storyMoment } from "#lib/server/db/seed/unit-story.ts";

import {
	type Breach,
	defaultThreshold,
	doorBreaches,
	openings,
	zoneBreaches,
	type ZoneInterval,
} from "../model.ts";
import { simulateDay } from "../simulation.ts";
import {
	DEMO_ENERGY_TOKEN,
	riedelConsumers,
	riedelDoors,
	riedelSite,
	riedelZones,
	SIMULATION_SEED,
} from "./riedel.ts";
import {
	energyAlert,
	energyConsumer,
	energyDoor,
	energyDoorEvent,
	energyReading,
	energySite,
	energyThreshold,
	energyZone,
} from "./schema.ts";

/** The door that is the unit of the demo's timeline (`#lib/server/db/seed/unit-story.ts`). */
const STORY_DOOR = "D-07";

/** How many days of history before today. */
const HISTORY_DAYS = 30;

/** Riedel's site in Ede and its units by name, in the tenant. */
async function findRiedel(tx: SeedTransaction, organizationId: string) {
	const [site] = await tx
		.select({ id: customerSite.id, customerId: customer.id })
		.from(customerSite)
		.innerJoin(customer, eq(customer.id, customerSite.customerId))
		.where(
			and(
				eq(customerSite.organizationId, organizationId),
				eq(customer.name, riedelSite.customer),
				eq(customerSite.name, riedelSite.site),
			),
		);
	if (!site) return undefined;
	const units = await tx
		.select({ id: equipment.id, name: equipment.name })
		.from(equipment)
		.where(eq(equipment.customerId, site.customerId));
	return { site, unitIds: new Map(units.map((unit) => [unit.name, unit.id])) };
}

export default defineSeed({
	async run({ tx, tenants, count }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const riedel = await findRiedel(tx, organizationId);
			if (!riedel) continue;
			const unit = (name?: string) => (name ? (riedel.unitIds.get(name) ?? null) : null);
			const link = (name?: string) => withTenantRefs(organizationId, { equipmentId: unit(name) });

			const { customer: _customer, site: _site, ...siteFields } = riedelSite;
			const [site] = await tx
				.insert(energySite)
				.values({ organizationId, siteId: riedel.site.id, ...siteFields })
				.returning({ id: energySite.id });
			count("energySites", [site]);

			const zones = await tx
				.insert(energyZone)
				.values(
					riedelZones.map((zone, position) => ({
						organizationId,
						energySiteId: site.id,
						code: zone.code,
						name: zone.name,
						floor: zone.floor,
						areaM2: zone.areaM2,
						position,
					})),
				)
				.returning({ id: energyZone.id, code: energyZone.code });
			const zoneId = new Map(zones.map((zone) => [zone.code, zone.id]));
			count("energyZones", zones);

			const consumers = riedelConsumers.map((consumer, position) => ({
				organizationId,
				zoneId: zoneId.get(consumer.zone)!,
				name: consumer.name,
				ratedKw: consumer.ratedKw,
				position,
				...link(consumer.unit),
			}));
			await tx.insert(energyConsumer).values(consumers);
			count("energyConsumers", consumers);

			const doors = await tx
				.insert(energyDoor)
				.values(
					riedelDoors.map((door) => ({
						organizationId,
						energySiteId: site.id,
						zoneId: zoneId.get(door.zone)!,
						code: door.code,
						name: door.name,
						kind: door.kind,
						lossKw: door.lossKw,
						thresholdMinutes: door.thresholdMinutes,
						insideC: door.insideC,
						outsideC: door.outsideC,
						...link(door.unit),
					})),
				)
				.returning({ id: energyDoor.id, code: energyDoor.code });
			const doorId = new Map(doors.map((door) => [door.code, door.id]));
			count("energyDoors", doors);

			// §2.5's defaults, from each zone's typical working day.
			const thresholds = riedelZones.map((zone) => ({
				zoneId: zoneId.get(zone.code)!,
				organizationId,
				...defaultThreshold({ tone: zone.tone, peakKw: zone.peakKw, kwh: zone.kwhPerDay }),
			}));
			await tx.insert(energyThreshold).values(thresholds);
			count("energyThresholds", thresholds);

			// The history up to the last quarter hour that has ended, and today so far.
			const until = toMoment(now);
			const { timeZone } = riedelSite;
			const today = until.toZonedDateTimeISO(timeZone).toPlainDate();
			const readings: (typeof energyReading.$inferInsert)[] = [];
			const events: (typeof energyDoorEvent.$inferInsert)[] = [];
			for (let back = HISTORY_DAYS; back >= 0; back--) {
				const day = today.subtract({ days: back });
				const simulated = simulateDay({
					zones: riedelZones,
					doors: riedelDoors,
					day,
					timeZone,
					seed: SIMULATION_SEED,
					until,
				});
				for (const { zone, ...reading } of simulated.readings) {
					readings.push({ organizationId, zoneId: zoneId.get(zone)!, ...reading });
				}
				for (const { door, ...event } of simulated.doorEvents) {
					events.push({ organizationId, doorId: doorId.get(door)!, ...event });
				}
			}
			// D-07's day as its timeline tells it: open for 14 minutes from 08:12 (`unit-story.ts`).
			const storyDoor = doorId.get(STORY_DOOR)!;
			const [opens, closes] = [storyMoment("08:12"), storyMoment("08:26")];
			const quiet = [opens.subtract({ minutes: 7 }), closes.add({ minutes: 5 })];
			const story = events.filter(
				(event) =>
					event.doorId !== storyDoor ||
					Temporal.Instant.compare(event.at, quiet[0]) < 0 ||
					Temporal.Instant.compare(event.at, quiet[1]) >= 0,
			);
			story.push(
				{ organizationId, doorId: storyDoor, at: opens, open: true },
				{ organizationId, doorId: storyDoor, at: closes, open: false },
			);
			events.splice(0, events.length, ...story);
			await insertRows(tx, energyReading, readings);
			await insertRows(tx, energyDoorEvent, events);
			count("energyReadings", readings);
			count("energyDoorEvents", events);

			// The last day's alerts, as the ingest would have raised them: the doors' (it looks at
			// every door after each batch), and a few of the zones'.
			const since = until.subtract({ hours: 24 });
			const recent = (breach: Breach) => Temporal.Instant.compare(breach.at, since) >= 0;
			const alerts: (typeof energyAlert.$inferInsert)[] = [];
			for (const zone of zones) {
				const own = readings
					.filter((reading) => reading.zoneId === zone.id)
					.toSorted((a, b) => Temporal.Instant.compare(a.start, b.start));
				const intervals: ZoneInterval[] = [];
				let today = "";
				let kwhToday = 0;
				for (const reading of own) {
					const local = reading.start.toZonedDateTimeISO(timeZone);
					const day = local.toPlainDate().toString();
					if (day !== today) [today, kwhToday] = [day, 0];
					kwhToday += reading.kwh;
					const hour = `${day}T${String(local.hour).padStart(2, "0")}`;
					intervals.push({ start: reading.start, day, hour, kw: reading.avgKw, kwhToday });
				}
				const threshold = thresholds.find((t) => t.zoneId === zone.id)!;
				const breaches = zoneBreaches(zone.id, intervals, threshold)
					.filter(recent)
					.toSorted((a, b) => Temporal.Instant.compare(a.at, b.at));
				// The latest two of a zone over its thresholds, rather than every hour.
				for (const breach of breaches.filter((b) => b.severity === "active").slice(-2)) {
					alerts.push({ organizationId, energySiteId: site.id, zoneId: zone.id, ...breach });
				}
			}
			for (const door of riedelDoors.filter((each) => each.code !== STORY_DOOR)) {
				const id = doorId.get(door.code)!;
				const own = events.filter((event) => event.doorId === id);
				const breaches = doorBreaches(id, openings(own), door.thresholdMinutes, until);
				// Every one of the last day's, as the ingest raises them (it looks at every door).
				for (const breach of breaches.filter(recent)) {
					alerts.push({
						organizationId,
						energySiteId: site.id,
						zoneId: zoneId.get(door.zone)!,
						doorId: id,
						...breach,
					});
				}
			}
			// The oldest one was dealt with already.
			alerts.sort((a, b) => Temporal.Instant.compare(a.at, b.at));
			if (alerts.length > 1) Object.assign(alerts[0], { status: "done", doneAt: until });
			// D-07's long opening of its story's day, open: after the others, so theirs stay as they were.
			const storyOwn = events.filter((event) => event.doorId === storyDoor);
			const storyThreshold = riedelDoors.find((door) => door.code === STORY_DOOR)!.thresholdMinutes;
			for (const breach of doorBreaches(storyDoor, openings(storyOwn), storyThreshold, until)) {
				if (!breach.at.equals(opens)) continue;
				alerts.push({
					organizationId,
					energySiteId: site.id,
					zoneId: zoneId.get("Z-DOCK")!,
					doorId: storyDoor,
					...breach,
				});
			}
			if (alerts.length) await tx.insert(energyAlert).values(alerts);
			count("energyAlerts", alerts);

			await seedIntegrationToken(tx, {
				organizationId,
				moduleId: "energy",
				name: "Simulator (demo)",
				token: DEMO_ENERGY_TOKEN,
				createdAt: until.subtract({ hours: HISTORY_DAYS * 24 }),
			});
		}
	},
});
