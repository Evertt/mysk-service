/**
 * A site's zone thresholds ("Energie-alerts per zone"): every member sees them, with each zone's
 * state now; only managers change them, a zone at a time.
 */
import { recordId } from "#lib/schema.ts";

import { thresholdSchema } from "./form/threshold-schema.ts";
import { forManagers, query } from "./remote-functions.ts";
import { loadSite, periodRanges, siteFigures } from "./server/figures.ts";
import { saveThreshold } from "./server/thresholds.ts";

/** The site's zones with their thresholds and state now. */
export const getEnergyThresholds = query(recordId(), async (id) => {
	const site = await loadSite(id);
	const now = Temporal.Now.instant();
	const { zones } = await siteFigures(site, periodRanges("day", site.timeZone, now), now);
	return { site, zones };
});

/** Saves a zone's thresholds (made with them if it had none). */
export const saveEnergyThreshold = forManagers.form(thresholdSchema, (input) =>
	saveThreshold(input),
);
