/**
 * The energy of a customer's own sites as their contact reads it in the customer portal
 * (`/energy/portal`): each site's figures for today or this month, its zones and its doors' losses,
 * read-only. Gated by the module's set for customers and scoped to their customer and the sites
 * they see (`#lib/server/auth/customer.ts`): another customer's site is never in it.
 */
import { and, asc, eq } from "drizzle-orm";
import * as v from "valibot";

import { atSites, currentCustomer, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customerSite } from "#lib/server/db/schema.ts";

import { periods } from "../model.ts";
import { forCustomers } from "../remote-functions.ts";
import { loadSite, periodRanges, siteFigures } from "../server/figures.ts";
import { energySite } from "../server/schema.ts";

/** The contact's sites with their figures over `period`. */
export const getClientEnergy = forCustomers.query(v.picklist(periods), async (period) => {
	const access = await currentCustomer();
	const own = await db
		.select({ id: energySite.id })
		.from(energySite)
		.innerJoin(...tenantJoin(customerSite, energySite.siteId))
		.where(
			and(
				inTenant(energySite),
				eq(customerSite.customerId, access.customer.id),
				atSites(access, customerSite.id),
			),
		)
		.orderBy(asc(energySite.name));
	const now = Temporal.Now.instant();
	const sites = await Promise.all(
		own.map(async ({ id }) => {
			const site = await loadSite(id);
			const figures = await siteFigures(site, periodRanges(period, site.timeZone, now), now);
			return {
				site: {
					id: site.id,
					name: site.name,
					city: site.city,
					meterName: site.meterName,
					tariff: site.tariff,
					co2Factor: site.co2Factor,
				},
				previousComplete: figures.previousComplete,
				zones: figures.zones,
				// Their doors' figures, without the units' links into the office.
				doors: figures.doors.map((door) => ({ ...door, unit: null, equipmentId: null })),
			};
		}),
	);
	return { period, asOf: now, sites };
});
