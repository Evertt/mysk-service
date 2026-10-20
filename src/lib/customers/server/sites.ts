/**
 * Changing the tenant's customer sites, each in a transaction that also logs it
 * (`recordActivity`). A site is logged against its customer too (`parent`), so it shows on the
 * customer's activity card. A customer always keeps one site: its equipment has to be somewhere.
 * The modules have a say in a site's removal (`removingSite`, `#lib/customers/extensions.ts`).
 */
import { and, count, eq } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { recordActivity, type LoggedSubjects } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";
import { customer, customerSite, equipment } from "#lib/server/db/schema.ts";
import { vote } from "#lib/server/extensions.ts";
import { deleteAndLog, orNotFound } from "#lib/server/records.ts";
import { Refused } from "#lib/server/refused.ts";

import { removingSite } from "../extensions.ts";
import type { SiteInput } from "../form/site-schema.ts";

/** A site's customer, as the activity log and the pages know it. */
interface Owner {
	id: number;
	code: string;
}

/** A site as the activity log knows it: the record, and its customer as its parent. */
const subjects = (site: { id: number; name: string }, owner: Owner): LoggedSubjects => ({
	subject: { type: "site", id: site.id, label: site.name },
	parent: customerSubject(owner),
});

/** The tenant's customer with `id`, or a 404. */
async function findCustomer(tx: Transaction, id: number): Promise<Owner> {
	return orNotFound(
		await tx
			.select({ id: customer.id, code: customer.code })
			.from(customer)
			.where(idInTenant(customer, id)),
		m.customers_not_found(),
	);
}

/** The tenant's site with `id`, with its customer, or a 404. */
async function findSite(tx: Transaction, id: number) {
	return orNotFound(
		await tx
			.select({ site: customerSite, owner: { id: customer.id, code: customer.code } })
			.from(customerSite)
			.innerJoin(...tenantJoin(customer, customerSite.customerId))
			.where(idInTenant(customerSite, id)),
		m.customers_site_not_found(),
	);
}

/**
 * Adds a site to the tenant's customer `customerId`, in `tx`; returns its id. Not logged: it's a
 * new customer's first site, part of their creation (which `createCustomer` logs), or `createSite`
 * logs it.
 */
export async function addSite(tx: Transaction, customerId: number, input: SiteInput) {
	const { organizationId } = currentTenant();
	const [created] = await tx
		.insert(customerSite)
		.values({ ...input, organizationId, customerId })
		.returning({ id: customerSite.id });
	return created.id;
}

/** Adds a site to the tenant's customer `customerId`, and logs it; returns the customer's code. */
export function createSite(customerId: number, input: SiteInput) {
	return db.transaction(async (tx) => {
		const owner = await findCustomer(tx, customerId);
		const id = await addSite(tx, owner.id, input);
		await recordActivity(tx, { action: "created", ...subjects({ id, name: input.name }, owner) });
		return owner.code;
	});
}

/** Changes the tenant's site `id`; returns its customer's code. */
export function updateSite(id: number, input: SiteInput) {
	return db.transaction(async (tx) => {
		const { site, owner } = await findSite(tx, id);
		await tx.update(customerSite).set(input).where(idInTenant(customerSite, id));
		await recordActivity(tx, {
			action: "updated",
			...subjects({ id, name: input.name }, owner),
			before: site,
			after: input,
		});
		return owner.code;
	});
}

/**
 * Deletes the tenant's site `id`; refuses one with equipment, a customer's last site, and one a
 * module refuses (`removingSite`: it has records there, which would go with it). Returns its
 * customer's code.
 */
export function removeSite(id: number) {
	return db.transaction(async (tx) => {
		const { site, owner } = await findSite(tx, id);
		const [units] = await tx
			.select({ n: count() })
			.from(equipment)
			.where(and(eq(equipment.siteId, id), inTenant(equipment)));
		const [sites] = await tx
			.select({ n: count() })
			.from(customerSite)
			.where(and(eq(customerSite.customerId, owner.id), inTenant(customerSite)));
		if (units.n) throw new Refused(m.customers_site_delete_refused({ count: units.n }));
		if (sites.n <= 1) throw new Refused(m.customers_site_delete_last());
		const refusals = await vote(removingSite, { tx, site: { id, customerId: owner.id } });
		if (refusals.length) throw new Refused(...refusals);
		await deleteAndLog(customerSite, { tx, ...subjects(site, owner) });
		return owner.code;
	});
}
