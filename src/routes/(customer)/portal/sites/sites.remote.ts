/**
 * The customer portal's sites, for a customer's head office that follows them all: the overview of
 * the customer's sites the contact sees, live, one site's page with its units and open work, and
 * its printable maintenance report. Gated by `forCustomers`; the sites are those the access registry
 * lets the contact read (their customer's, at the sites they're limited to), so another customer's
 * site, or one they don't see, is a 404, also by a tampered id.
 */
import * as v from "valibot";

import { siteOverview, sitePage, siteReport } from "#lib/customers/server/index.ts";
import { customerUnits } from "#lib/equipment/server/index.ts";
import { id } from "#lib/schema.ts";
import { currentCustomer } from "#lib/server/auth/index.ts";
import { forCustomers } from "#lib/server/remote-functions.ts";

/** A day in a report's URL, `yyyy-mm-dd`. */
const day = () => v.optional(v.pipe(v.string(), v.isoDate()));

/** The overview of the sites the contact sees: each with its figures, worst first. */
export const getPortalSiteOverview = forCustomers.query(async () => siteOverview());

/** One of the sites the contact sees (or a 404): where it is, its figures, units and open work. */
export const getPortalSite = forCustomers.query(id(), async (siteId) =>
	sitePage(siteId, await customerUnits(await currentCustomer())),
);

/** One of the sites' maintenance report over days `from` to `to` (this month by default). */
export const getPortalSiteReport = forCustomers.query(
	v.object({ id: id(), from: day(), to: day() }),
	async (input) => siteReport(input.id, input, await customerUnits(await currentCustomer())),
);
