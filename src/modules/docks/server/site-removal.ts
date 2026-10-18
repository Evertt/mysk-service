/**
 * The docks' answer when core is about to delete a customer's site (`customers.removingSite`): the
 * site's docks would go with it, their states, sessions, events and escalations too, unlogged (the
 * keys cascade). So a site with docks stays until they're deleted on the customer's docks card,
 * each logged (`deleteDock()` in `docks.ts`).
 */
import { and, count, eq } from "drizzle-orm";

import type { SiteRemoval } from "#lib/customers/extensions.ts";
import { inTenant } from "#lib/server/auth/index.ts";

import { dockPosition } from "./schema.ts";

/** A refusal saying how many docks the site has, or none when it has none. */
export async function siteDocksRefusal({ tx, site }: SiteRemoval) {
	const [docks] = await tx
		.select({ n: count() })
		.from(dockPosition)
		.where(and(eq(dockPosition.siteId, site.id), inTenant(dockPosition)));
	return docks.n ? m.docks_site_delete_refused({ count: docks.n }) : undefined;
}
