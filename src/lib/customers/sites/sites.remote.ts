/**
 * A customer's sites in the office, as its head office sees them in the customer portal: the
 * overview of all of them, live, one site's page with its units and open work, and its printable
 * maintenance report. By the customer's code (a 404 for another tenant's) and the site's id, which
 * must be that customer's (a 404 otherwise, also by a tampered id).
 */
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { customerByCode, siteOverview, sitePage, siteReport } from "#lib/customers/server/index.ts";
import { officeUnits } from "#lib/equipment/server/index.ts";
import { customerCode, id } from "#lib/schema.ts";
import { customer as customerTable, customerSite } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

/** A day in a report's URL, `yyyy-mm-dd`. */
const day = () => v.optional(v.pipe(v.string(), v.isoDate()));

/** The overview of the customer's sites: the customer, and each site with its figures, worst first. */
export const getCustomerSites = forMembers.query(customerCode(), async (code) => {
	const customer = await customerByCode(code, {
		id: customerTable.id,
		code: customerTable.code,
		name: customerTable.name,
	});
	return { customer, ...(await siteOverview(eq(customerSite.customerId, customer.id))) };
});

/** One of the customer's sites (or a 404): where it is, its figures, units and open work. */
export const getCustomerSite = forMembers.query(
	v.object({ code: customerCode(), id: id() }),
	async (input) => {
		const customer = await customerByCode(input.code);
		return sitePage(input.id, await officeUnits(), eq(customerSite.customerId, customer.id));
	},
);

/** One of the customer's sites' maintenance report over days `from` to `to` (this month by default). */
export const getCustomerSiteReport = forMembers.query(
	v.object({ code: customerCode(), id: id(), from: day(), to: day() }),
	async (input) => {
		const customer = await customerByCode(input.code);
		return siteReport(
			input.id,
			input,
			await officeUnits(),
			eq(customerSite.customerId, customer.id),
		);
	},
);
