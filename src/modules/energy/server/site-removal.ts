/**
 * Energy's answer when core is about to delete a customer's site (`customers.removingSite`): the
 * site's energy site would go with it, its zones, consumers, doors and thresholds and every reading,
 * door event and alert they hold, unlogged (the keys cascade). So a monitored site stays until its
 * energy site is deleted on its setup page, which refuses one that holds measurements (`setup.ts`);
 * also while the tenant has energy off, whose setup page is gone until they switch it on again.
 */
import { and, eq } from "drizzle-orm";

import type { SiteRemoval } from "#lib/customers/extensions.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import type { Voter } from "#lib/server/extensions.ts";

import { energySite } from "./schema.ts";

/** A refusal naming the site's energy site, or none when its energy isn't monitored. */
export async function siteEnergyRefusal({ tx, site }: SiteRemoval, { on }: Voter) {
	const [monitored] = await tx
		.select({ name: energySite.name })
		.from(energySite)
		.where(and(eq(energySite.siteId, site.id), inTenant(energySite)));
	if (!monitored) return undefined;
	return on
		? m.energy_site_delete_refused({ name: monitored.name })
		: m.energy_site_delete_refused_off();
}
