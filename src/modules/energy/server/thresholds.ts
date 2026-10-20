/**
 * A zone set up in the office starts without thresholds (`parts.ts`): it raises no alerts until a
 * manager sets them, or until its readings span a day, when a batch (`ingest.ts`, in its
 * transaction, before the alerts are evaluated) gives it §2.5's defaults from that day
 * (`firstDayThreshold()` in `../model.ts`), logged as the system's. Thresholds a manager set, or
 * switched off, are never replaced.
 */
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type * as v from "valibot";

import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { orNotFound } from "#lib/server/records.ts";

import type { thresholdSchema } from "../form/threshold-schema.ts";
import { firstDayThreshold, INTERVAL_MINUTES } from "../model.ts";
import { energyReading, energySite, energyThreshold, energyZone } from "./schema.ts";
import { siteSubject } from "./sites.ts";

/**
 * The arguments of a join from `energyZone` to its thresholds, kept in the tenant as `tenantJoin()`
 * keeps one (which needs an `id`; a threshold is keyed by its zone):
 * `.leftJoin(...zoneThresholds())`.
 */
export const zoneThresholds = () =>
	[
		energyThreshold,
		and(eq(energyThreshold.zoneId, energyZone.id), inTenant(energyThreshold))!,
	] as const;

/**
 * Gives the zones of `zoneIds` (of the energy site `site`) that have no thresholds the defaults of
 * their first day of readings, once they have one. Answers how many it set.
 */
export async function setFirstThresholds(
	tx: Transaction,
	site: { id: number; name: string },
	zoneIds: number[],
): Promise<number> {
	if (!zoneIds.length) return 0;
	const zones = await tx
		.select({ id: energyZone.id, code: energyZone.code })
		.from(energyZone)
		.leftJoin(...zoneThresholds())
		.where(
			and(
				inTenant(energyZone),
				eq(energyZone.energySiteId, site.id),
				inList(energyZone.id, zoneIds),
				isNull(energyThreshold.zoneId),
			),
		);
	const { organizationId } = currentTenant();
	let set = 0;
	for (const zone of zones) {
		const ofZone = and(inTenant(energyReading), eq(energyReading.zoneId, zone.id));
		const columns = {
			start: energyReading.start,
			avgKw: energyReading.avgKw,
			peakKw: energyReading.peakKw,
			kwh: energyReading.kwh,
		};
		const [[first], [latest]] = await Promise.all([
			tx.select(columns).from(energyReading).where(ofZone).orderBy(energyReading.start).limit(1),
			tx
				.select(columns)
				.from(energyReading)
				.where(ofZone)
				.orderBy(desc(energyReading.start))
				.limit(1),
		]);
		if (!first || !latest) continue;
		// The last day's intervals, and the first one, which says how far back the readings go.
		const from = latest.start.add({ minutes: INTERVAL_MINUTES }).subtract({ hours: 24 });
		const lastDay = await tx
			.select(columns)
			.from(energyReading)
			.where(and(ofZone, gte(energyReading.start, from)));
		const firstIn = lastDay.some((reading) => reading.start.equals(first.start));
		const threshold = firstDayThreshold(firstIn ? lastDay : [first, ...lastDay]);
		if (!threshold) continue;
		await tx.insert(energyThreshold).values({ zoneId: zone.id, organizationId, ...threshold });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "energy_threshold", id: zone.id, label: zone.code },
			parent: siteSubject(site),
			after: threshold,
		});
		set++;
	}
	return set;
}

/** Saves a zone's thresholds (a manager's, on the thresholds page; made with them if it had none). */
export async function saveThreshold({ zoneId, ...after }: v.InferOutput<typeof thresholdSchema>) {
	const zone = orNotFound(
		await db
			.select({ id: energyZone.id, code: energyZone.code, site: energySite })
			.from(energyZone)
			.innerJoin(...tenantJoin(energySite, energyZone.energySiteId))
			.where(idInTenant(energyZone, zoneId)),
		m.energy_zone_not_found(),
	);
	await db.transaction(async (tx) => {
		const [before] = await tx
			.select()
			.from(energyThreshold)
			.where(and(eq(energyThreshold.zoneId, zone.id), inTenant(energyThreshold)));
		await tx
			.insert(energyThreshold)
			.values({ zoneId: zone.id, organizationId: currentTenant().organizationId, ...after })
			.onConflictDoUpdate({ target: energyThreshold.zoneId, set: after });
		await recordActivity(tx, {
			action: before ? "updated" : "created",
			subject: { type: "energy_threshold", id: zone.id, label: zone.code },
			parent: siteSubject(zone.site),
			before: before ?? null,
			after,
		});
	});
}
