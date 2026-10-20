/**
 * The customer portal's scopes: what a customer's contact may see is their customer's records in
 * the tenant, and of those at sites only the sites they're limited to (if they are, see
 * `CustomerAccess`). Every query of a `forCustomers` remote function (and a module's
 * `moduleRemote(id, "customer")`) builds its `where` from these, with what `currentCustomer()`
 * answers, so another customer's record (or another tenant's) is a 404, also by a tampered id.
 *
 * An order is at a site through its units: one a site-limited contact sees has at least one unit
 * at one of their sites (an order without units has no site, so only contacts of all sites see
 * it), and of its units they see only those at their sites.
 */
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

import { inList } from "#lib/server/db/parameters.ts";
import { equipment, order, orderUnit } from "#lib/server/db/schema.ts";

import { type CustomerAccess, inTenant, tenantJoin } from "./session.ts";

/** A tenant table of a customer's records: with the customer's id and the tenant's. */
interface CustomerTable {
	organizationId: SQLiteColumn;
	customerId: SQLiteColumn;
}

/** The contact's customer's records of `table` in the current tenant. */
export const ofCustomer = (access: CustomerAccess, table: CustomerTable): SQL =>
	and(inTenant(table), eq(table.customerId, access.customer.id))!;

/**
 * Of records at a site (a unit's `equipment.siteId`, a site's own `customerSite.id`, a location's
 * `siteId`), those at the sites the contact sees: all of them (no condition) or theirs.
 */
export const atSites = (access: CustomerAccess, siteId: SQLiteColumn): SQL | undefined =>
	access.siteIds === null ? undefined : inList(siteId, access.siteIds);

/** Whether the contact sees the site `siteId`, one of their customer's (checked apart). */
export const seesSite = (access: CustomerAccess, siteId: number) =>
	access.siteIds === null || access.siteIds.includes(siteId);

/**
 * For a query on `order`: the contact's customer's orders they see, those with a unit at one of
 * their sites if they're limited to some.
 */
export function customerOrders(access: CustomerAccess): SQL {
	const own = ofCustomer(access, order);
	if (access.siteIds === null) return own;
	const [, unitOfLink] = tenantJoin(equipment, orderUnit.equipmentId);
	return and(
		own,
		sql`exists (select 1 from ${orderUnit} inner join ${equipment} on ${unitOfLink} where ${and(
			eq(orderUnit.orderId, order.id),
			inTenant(orderUnit),
			inList(equipment.siteId, access.siteIds),
		)})`,
	)!;
}
