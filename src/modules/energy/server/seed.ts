/**
 * The energy module's demo data: SHLTR's "Riedel Ede — Productielocatie" (§2.5, `riedel.ts`) with
 * its eight zones, eleven consumers and four doors (the freezer's door and the dock lift linked to
 * Riedel's units), each zone's default thresholds, 30 days of history and today's readings so far
 * (15-minute aggregates per zone, from the simulation the simulator posts too, so a day posted
 * again changes nothing), the doors' events, a few open alerts from the last day and the token the
 * simulator posts with. Only SHLTR has the module. The simulation's own random numbers, so the rest
 * of the demo data is the same with or without it.
 */
import { and, eq } from "drizzle-orm";

import { customer, customerSite, equipment } from "#lib/server/db/schema.ts";
import { now } from "#lib/server/db/seed/clock.ts";
import { seedIntegrationToken } from "#lib/server/db/seed/integrations.ts";
import { defineSeed, type ModuleSeed } from "#lib/server/db/seed/module-seed.ts";
import { toMoment } from "#lib/server/db/seed/temporal.ts";

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

/** How many days of history before today. */
const HISTORY_DAYS = 30;

type Transaction = Parameters<ModuleSeed["run"]>[0]["tx"];

/** Rows in statements of `size` (the seed runs in Node, whose libsql takes many parameters). */
async function insertMany<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>, size = 1000) {
	for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/** Riedel's site in Ede and its units by name, in the tenant. */
async function findRiedel(tx: Transaction, organizationId: string) {
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
	clear: async (tx) => {
		for (const table of [
			energyAlert,
			energyDoorEvent,
			energyReading,
			energyThreshold,
			energyDoor,
			energyConsumer,
			energyZone,
			energySite,
		]) {
			await tx.delete(table);
		}
	},

	async run({ tx, tenants, count }) {
		for (const tenant of tenants) {
			const organizationId = tenant.id;
			const riedel = await findRiedel(tx, organizationId);
			if (!riedel) continue;
			const unit = (name?: string) => (name ? (riedel.unitIds.get(name) ?? null) : null);
			const link = (name?: string) => {
				const id = unit(name);
				return { equipmentId: id, equipmentOrganizationId: id ? organizationId : null };
			};

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
			await insertMany(readings, (chunk) => tx.insert(energyReading).values(chunk));
			await insertMany(events, (chunk) => tx.insert(energyDoorEvent).values(chunk));
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
				let day = "";
				let kwhToday = 0;
				for (const reading of own) {
					const local = reading.start.toZonedDateTimeISO(timeZone);
					const date = local.toPlainDate().toString();
					if (date !== day) [day, kwhToday] = [date, 0];
					kwhToday += reading.kwh;
					const hour = `${date}T${String(local.hour).padStart(2, "0")}`;
					intervals.push({ start: reading.start, hour, kw: reading.avgKw, kwhToday });
				}
				const threshold = thresholds.find((t) => t.zoneId === zone.id)!;
				const breaches = zoneBreaches(zone.id, intervals, threshold).filter(recent);
				// The latest two of a zone over its thresholds, rather than every hour.
				for (const breach of breaches.filter((b) => b.severity === "active").slice(-2)) {
					alerts.push({ organizationId, energySiteId: site.id, zoneId: zone.id, ...breach });
				}
			}
			for (const door of riedelDoors) {
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
