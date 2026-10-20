/**
 * A site's zone thresholds ("Energie-alerts per zone"): every member sees them, with each zone's
 * state now; only managers change them, a zone at a time.
 */
import { and, eq } from "drizzle-orm";

import { isManager } from "#lib/auth/index.ts";
import { recordId } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { orNotFound } from "#lib/server/records.ts";

import { thresholdSchema } from "./form/threshold-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { loadSite, periodRanges, siteFigures } from "./server/figures.ts";
import { energySite, energyThreshold, energyZone } from "./server/schema.ts";

/** The site's zones with their thresholds and state now, and whether the user may change them. */
export const getEnergyThresholds = query(recordId(), async (id) => {
	const site = await loadSite(id);
	const now = Temporal.Now.instant();
	const { zones } = await siteFigures(site, periodRanges("day", site.timeZone, now), now);
	return { site, zones, canManage: isManager(currentTenant().roles) };
});

/** Saves a zone's thresholds (made with them if it had none). */
export const saveEnergyThreshold = forManagers.form(thresholdSchema, async (input) => {
	const { organizationId } = currentTenant();
	const zone = orNotFound(
		await db
			.select({
				id: energyZone.id,
				code: energyZone.code,
				siteId: energySite.id,
				siteName: energySite.name,
			})
			.from(energyZone)
			.innerJoin(...tenantJoin(energySite, energyZone.energySiteId))
			.where(idInTenant(energyZone, input.zoneId)),
		m.energy_zone_not_found(),
	);
	const [before] = await db
		.select()
		.from(energyThreshold)
		.where(and(eq(energyThreshold.zoneId, zone.id), inTenant(energyThreshold)));
	const after = { enabled: input.enabled, maxKw: input.maxKw, maxKwh: input.maxKwh };
	await db.transaction(async (tx) => {
		await tx
			.insert(energyThreshold)
			.values({ zoneId: zone.id, organizationId, ...after })
			.onConflictDoUpdate({ target: energyThreshold.zoneId, set: after });
		await recordActivity(tx, {
			action: before ? "updated" : "created",
			subject: { type: "energy_threshold", id: zone.id, label: zone.code },
			parent: { type: "energy_site", id: zone.siteId, label: zone.siteName },
			before: before ?? null,
			after,
		});
	});
	void getEnergyThresholds(zone.siteId).refresh();
});
