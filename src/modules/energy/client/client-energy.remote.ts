/**
 * The energy of a customer's own sites as their contact reads it in the customer portal
 * (`/energy/portal`): each site's figures for today or this month, its zones and its doors' losses,
 * read-only. Gated by the module's set for customers and scoped to their customer and the sites
 * they see (`#lib/server/auth/customer.ts`): another customer's site is never in it.
 */
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { atSites, currentCustomer } from "#lib/server/auth/index.ts";
import { customerSite } from "#lib/server/db/schema.ts";

import { periods } from "../model.ts";
import { forCustomers } from "../remote-functions.ts";
import { loadSites, periodRanges, sitesFigures } from "../server/figures.ts";

/** The contact's sites with their figures over `period`. */
export const getClientEnergy = forCustomers.query(v.picklist(periods), async (period) => {
	const access = await currentCustomer();
	const own = await loadSites(
		and(eq(customerSite.customerId, access.customer.id), atSites(access, customerSite.id)),
	);
	const now = Temporal.Now.instant();
	const ofSites = own.map((site) => ({ site, ranges: periodRanges(period, site.timeZone, now) }));
	const figures = await sitesFigures(ofSites, now);
	const sites = ofSites.map(({ site, ranges }, index) => ({
		from: ranges.from,
		site: {
			id: site.id,
			name: site.name,
			city: site.city,
			meterName: site.meterName,
			tariff: site.tariff,
			co2Factor: site.co2Factor,
			timeZone: site.timeZone,
		},
		previousComplete: figures[index].previousComplete,
		zones: figures[index].zones,
		// Their doors' figures, without the units' links into the office.
		doors: figures[index].doors.map((door) => ({ ...door, unit: null, equipmentId: null })),
	}));
	return { period, asOf: now, sites };
});
