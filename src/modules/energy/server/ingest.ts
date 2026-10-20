/**
 * Storing a gateway's batch (`../ingest/format.ts`): in the token's tenant (the request runs as
 * the system there, see `#lib/server/auth/integrations.ts`), against one of its sites, in one
 * transaction. Readings replace the zone's interval, door events that are in already are skipped,
 * a zone without thresholds gets its defaults once it has a day of readings (`thresholds.ts`),
 * then the site's thresholds are evaluated (`evaluate.ts`) and the alerts raised; the live queries
 * hear of it once it's committed. Everything is written with `insertRows()` and lists bound as
 * one JSON parameter, so no statement passes Cloudflare's 100 parameters, whatever the batch.
 */
import { and, eq, gte, lte, sql } from "drizzle-orm";

import { earlier, later, momentSeconds } from "#lib/dates.ts";
import { currentTenant, idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { announceChange } from "#lib/server/changes.ts";
import { db } from "#lib/server/db/index.ts";
import { inList, insertRows } from "#lib/server/db/parameters.ts";
import { afterCommit } from "#lib/server/db/serialize.ts";
import { IngestRefused, UnknownCodes } from "#lib/server/modules/integrations.ts";

import type { Batch, IngestResult } from "../ingest/format.ts";
import { raiseAlerts } from "./evaluate.ts";
import { energyDoor, energyDoorEvent, energyReading, energySite, energyZone } from "./schema.ts";
import { setFirstThresholds } from "./thresholds.ts";

/** The current tenant's site `id`, with its zones' and doors' codes. */
async function siteWithCodes(id: number) {
	const [site] = await db
		.select({ id: energySite.id, name: energySite.name, timeZone: energySite.timeZone })
		.from(energySite)
		.where(idInTenant(energySite, id));
	if (!site) return undefined;
	const [zones, doors] = await Promise.all([
		db
			.select({ id: energyZone.id, code: energyZone.code })
			.from(energyZone)
			.where(and(inTenant(energyZone), eq(energyZone.energySiteId, site.id))),
		db
			.select({ id: energyDoor.id, code: energyDoor.code })
			.from(energyDoor)
			.where(and(inTenant(energyDoor), eq(energyDoor.energySiteId, site.id))),
	]);
	return {
		...site,
		zones: new Map(zones.map((zone) => [zone.code, zone.id])),
		doors: new Map(doors.map((door) => [door.code, door.id])),
	};
}

/** The current tenant's sites with their codes, for setting a gateway up (`GET /energy/ingest`). */
export async function ingestSites() {
	const sites = await db
		.select({ id: energySite.id, name: energySite.name, timeZone: energySite.timeZone })
		.from(energySite)
		.where(inTenant(energySite))
		.orderBy(energySite.id);
	const [zones, doors] = await Promise.all([
		db
			.select({ site: energyZone.energySiteId, code: energyZone.code })
			.from(energyZone)
			.where(inTenant(energyZone))
			.orderBy(energyZone.position, energyZone.id),
		db
			.select({ site: energyDoor.energySiteId, code: energyDoor.code })
			.from(energyDoor)
			.where(inTenant(energyDoor))
			.orderBy(energyDoor.code),
	]);
	return sites.map((site) => ({
		...site,
		zones: zones.filter((zone) => zone.site === site.id).map((zone) => zone.code),
		doors: doors.filter((door) => door.site === site.id).map((door) => door.code),
	}));
}

/**
 * Stores `batch` in the current tenant (see above). Refuses (storing nothing) a site the tenant
 * hasn't, a 404, and codes the site hasn't (`UnknownCodes`).
 */
export async function storeBatch(
	batch: Batch,
	now = Temporal.Now.instant(),
): Promise<IngestResult> {
	const site = await siteWithCodes(batch.site);
	if (!site) throw new IngestRefused("unknown_site", m.energy_site_not_found(), {}, 404);
	const unknown = {
		zones: [...new Set(batch.readings.map((r) => r.zone))].filter((c) => !site.zones.has(c)),
		doors: [...new Set(batch.doorEvents.map((e) => e.door))].filter((c) => !site.doors.has(c)),
	};
	if (unknown.zones.length || unknown.doors.length) throw new UnknownCodes(unknown);

	const { organizationId } = currentTenant();
	const readings = batch.readings.map((r) => ({
		organizationId,
		zoneId: site.zones.get(r.zone)!,
		start: r.start,
		avgKw: r.avgKw,
		peakKw: r.peakKw,
		kwh: r.kwh,
	}));
	const events = batch.doorEvents.map((e) => ({
		organizationId,
		doorId: site.doors.get(e.door)!,
		at: e.at,
		open: e.state === "open",
	}));

	const stored = await db.transaction(async (tx) => {
		if (readings.length) {
			// A resent interval replaces the one in: delete, then insert, by (zone, start).
			const keys = JSON.stringify(readings.map((r) => [r.zoneId, momentSeconds(r.start)]));
			await tx
				.delete(energyReading)
				.where(
					and(
						inTenant(energyReading),
						sql`(${energyReading.zoneId}, ${energyReading.start}) in (select json_extract(value, '$[0]'), json_extract(value, '$[1]') from json_each(${keys}))`,
					),
				);
			await insertRows(tx, energyReading, readings);
		}

		let added: typeof events = [];
		if (events.length) {
			const times = events.map((e) => e.at);
			const earliest = times.reduce(earlier);
			const latest = times.reduce(later);
			const existing = await tx
				.select({
					doorId: energyDoorEvent.doorId,
					at: energyDoorEvent.at,
					open: energyDoorEvent.open,
				})
				.from(energyDoorEvent)
				.where(
					and(
						inTenant(energyDoorEvent),
						inList(
							energyDoorEvent.doorId,
							events.map((e) => e.doorId),
						),
						gte(energyDoorEvent.at, earliest),
						lte(energyDoorEvent.at, latest),
					),
				);
			const key = (e: { doorId: number; at: Temporal.Instant; open: boolean }) =>
				`${e.doorId}|${momentSeconds(e.at)}|${e.open}`;
			const known = new Set(existing.map(key));
			added = events.filter((e) => !known.has(key(e)));
			if (added.length) await insertRows(tx, energyDoorEvent, added);
		}

		const zoneIds = [...new Set(readings.map((r) => r.zoneId))];
		// A zone set up without thresholds gets its defaults once it has a day of readings.
		await setFirstThresholds(tx, site, zoneIds);
		const alerts = await raiseAlerts(tx, site, {
			zoneIds,
			starts: readings.map((r) => r.start),
			now,
		});
		afterCommit(() => announceChange(organizationId, "energy_reading", { action: "updated" }));
		return { readings: readings.length, doorEvents: added.length, alerts };
	});
	return stored;
}
