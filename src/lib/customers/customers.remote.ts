import { error, redirect } from "@sveltejs/kit";
import { and, asc, count, eq, getTableColumns, max, sql } from "drizzle-orm";
import * as v from "valibot";

import { customerSubject } from "#lib/activity/index.ts";
import { doneOrderStatuses, openOrderStatuses } from "#lib/models.ts";
import { priceOrders, withUnitIds } from "#lib/orders/server/index.ts";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/index.ts";
import { currentTenant, idInTenant, inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { bulkChange, idsTarget } from "#lib/server/lists/index.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { customerFields } from "./form/customer-schema.ts";
import { siteAddressFields } from "./form/site-schema.ts";
import { knownCountries, refuseUnknownCountry } from "./server/countries.ts";
import { removeCustomer } from "./server/customers.ts";
import { customerByCode } from "./server/lookup.ts";
import { addSite } from "./server/sites.ts";

/** All customers with how many equipment units and open orders they have, by name. */
export const getCustomers = forMembers.query(async () => {
	const units = db
		.select({ customerId: equipment.customerId, count: count().as("unit_count") })
		.from(equipment)
		.where(inTenant(equipment))
		.groupBy(equipment.customerId)
		.as("units");
	const open = db
		.select({ customerId: order.customerId, count: count().as("open_count") })
		.from(order)
		.where(and(inTenant(order), inList(order.status, openOrderStatuses)))
		.groupBy(order.customerId)
		.as("open");

	return db
		.select({
			...getTableColumns(customer),
			equipmentCount: sql<number>`coalesce(${units.count}, 0)`,
			openOrders: sql<number>`coalesce(${open.count}, 0)`,
		})
		.from(customer)
		.leftJoin(units, eq(units.customerId, customer.id))
		.leftJoin(open, eq(open.customerId, customer.id))
		.where(inTenant(customer))
		.orderBy(asc(customer.name));
});

/**
 * Customers by code, each with their sites (each with how many units are there), their equipment
 * and how many orders they have: what their page shows, and their hover card (`CustomerLink`). A
 * batch query, so the cards of a page's links come in one request, and a hover card and the page
 * share their answer. An unknown code (or another tenant's) is a 404 for that code. Their revenue
 * is `getCustomerRevenue`, their latest orders `getCustomerActivity` (`detail/activity.remote.ts`).
 */
export const getCustomer = forMembers.query.batch(v.string(), async (codes) => {
	const found = await db.query.customer.findMany({
		where: and(inList(customer.code, codes), inTenant(customer)),
		with: {
			sites: { orderBy: (site, { asc }) => [asc(site.name), asc(site.id)] },
			equipment: {
				orderBy: (unit, { asc }) => [asc(unit.manufacturer), asc(unit.model)],
				with: {
					category: { columns: { name: true } },
					location: { columns: { id: true, name: true } },
				},
			},
		},
	});
	const counts = found.length
		? await db
				.select({
					customerId: order.customerId,
					orders: count(),
					openOrders: sql<number>`coalesce(sum(${inList(order.status, openOrderStatuses)}), 0)`,
					lastOrderAt: max(order.createdAt),
				})
				.from(order)
				.where(
					and(
						inList(
							order.customerId,
							found.map((c) => c.id),
						),
						inTenant(order),
					),
				)
				.groupBy(order.customerId)
		: [];
	const byCode = new Map(found.map((c) => [c.code, c]));
	const countsOf = new Map(counts.map((row) => [row.customerId, row]));

	return (code: string) => {
		const one = byCode.get(code);
		if (!one) error(404, m.customers_code_not_found({ code }));
		const unitsAt = Map.groupBy(one.equipment, (unit) => unit.siteId);
		const sites = one.sites.map((site) => ({
			...site,
			equipmentCount: unitsAt.get(site.id)?.length ?? 0,
		}));
		const counted = countsOf.get(one.id);
		return {
			customer: { ...one, sites },
			stats: {
				orders: counted?.orders ?? 0,
				openOrders: Number(counted?.openOrders ?? 0),
				lastOrderAt: counted?.lastOrderAt ?? null,
			},
		};
	};
});

/**
 * A customer's revenue: their done orders, priced like everywhere else (e.g. without the work their
 * contracts include). Only their page asks for it, apart from `getCustomer`, which a hover card
 * reads too.
 */
export const getCustomerRevenue = forMembers.query(v.string(), async (code) => {
	const found = await customerByCode(code);
	const done = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(
			and(eq(order.customerId, found.id), inList(order.status, doneOrderStatuses), inTenant(order)),
		);
	const prices = await priceOrders(await withUnitIds(done));
	return {
		revenue: prices.reduce((sum, price) => sum + price.total, 0),
		revenueOrders: done.length,
	};
});

/** Everything the customer form needs to choose from. */
export const getCustomerFormOptions = forMembers.query(async () => {
	return { countries: await knownCountries() };
});

/**
 * Creates a customer with their first site, at the address entered (in the customer's city and
 * country, named after the city): a customer always has a site, for their equipment.
 */
export const createCustomer = forMembers.form(
	v.object({ ...customerFields, ...siteAddressFields }),
	async ({ address, postalCode, ...input }) => {
		const { organizationId } = currentTenant();
		await refuseUnknownCountry(input.country);

		const code = await db.transaction(async (tx) => {
			const code = await nextNumber(tx, "customer");
			const [created] = await tx
				.insert(customer)
				.values({ ...input, organizationId, code })
				.returning({ id: customer.id });
			await recordActivity(tx, {
				action: "created",
				subject: customerSubject({ id: created.id, code }),
			});
			await addSite(tx, created.id, {
				name: input.city,
				address,
				postalCode,
				city: input.city,
				country: input.country,
				contactName: null,
				contactPhone: null,
				contactEmail: null,
				contactChannel: null,
				preferredDay: null,
				slotStart: null,
				slotEnd: null,
				priority: "normal",
				accessNotes: null,
			});
			return code;
		});
		void getCustomers().refresh();
		redirect(303, `/customers/${code}`);
	},
);

export const updateCustomer = forMembers.form(
	v.object({ id: id(), ...customerFields }),
	async ({ id, ...input }) => {
		const existing = await db.query.customer.findFirst({ where: idInTenant(customer, id) });
		if (!existing) error(404, m.customers_not_found());
		await refuseUnknownCountry(input.country);

		await db.transaction(async (tx) => {
			await tx.update(customer).set(input).where(idInTenant(customer, id));
			const subject = customerSubject({ id, code: existing.code });
			await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
		});
		void getCustomers().refresh();
		void getCustomer(existing.code).refresh();
		redirect(303, `/customers/${existing.code}`);
	},
);

export const deleteCustomer = forMembers.form(v.object({ id: id() }), async ({ id }) => {
	await removeCustomer(id);
	void getCustomers().refresh();
	redirect(303, "/customers");
});

/** Deletes the selected customers, with the same refusals as deleting one. */
export const bulkDeleteCustomers = forMembers.command(idsTarget, async (target) => {
	const result = await bulkChange(target, {
		table: customer,
		label: customer.code,
		change: (each) => removeCustomer(each.id),
	});
	void getCustomers().refresh();
	return result;
});
