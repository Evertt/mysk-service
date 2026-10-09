import { command, form, query } from "$app/server";
import { error, invalid, redirect } from "@sveltejs/kit";
import { and, asc, count, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import * as v from "valibot";

import { europeanCountries } from "#lib/customers/countries.ts";
import { isDoneOrder, isOpenOrder, openOrderStatuses } from "#lib/models.ts";
import { materialsPerOrder, priceOrders } from "#lib/orders/server/pricing.ts";
import { m } from "#lib/paraglide/messages.js";
import { id } from "#lib/schema.ts";
import { recordActivity } from "#lib/server/activity/log.ts";
import { idInTenant, inTenant, requireMember, tenantJoin } from "#lib/server/auth/session.ts";
import { bulkChange, idsTarget } from "#lib/server/bulk.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { type Problem, refuse } from "#lib/server/forms.ts";
import { nextNumber } from "#lib/server/numbering.ts";
import { deleteAndLog } from "#lib/server/records.ts";

import { customerFields } from "./customer-schema.ts";

/** All customers with how many equipment units and open orders they have, by name. */
export const getCustomers = query(async () => {
	requireMember();
	const units = db
		.select({ customerId: equipment.customerId, count: count().as("unit_count") })
		.from(equipment)
		.where(inTenant(equipment))
		.groupBy(equipment.customerId)
		.as("units");
	const open = db
		.select({ customerId: order.customerId, count: count().as("open_count") })
		.from(order)
		.where(and(inTenant(order), inArray(order.status, openOrderStatuses)))
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
 * One customer with their equipment and key figures. Their latest orders are
 * `getCustomerActivity` (`[code]/activity.remote.ts`).
 */
export const getCustomer = query(v.string(), async (code) => {
	requireMember();
	const found = await db.query.customer.findFirst({
		where: and(eq(customer.code, code), inTenant(customer)),
		with: {
			equipment: {
				orderBy: (unit, { asc }) => [asc(unit.manufacturer), asc(unit.model)],
			},
		},
	});
	if (!found) error(404, m.customers_code_not_found({ code }));

	const materials = materialsPerOrder();
	const orders = await db
		.select({
			id: order.id,
			type: order.type,
			status: order.status,
			equipmentId: order.equipmentId,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			hourlyRate: engineer.hourlyRate,
			materials: sql<number>`coalesce(${materials.total}, 0)`,
		})
		.from(order)
		.leftJoin(materials, eq(materials.orderId, order.id))
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(eq(order.customerId, found.id), inTenant(order)))
		.orderBy(desc(order.createdAt), desc(order.id));

	// The revenue is priced like everywhere else, e.g. without the work their contracts include.
	const done = orders.filter((o) => isDoneOrder(o.status));
	const prices = await priceOrders(done);
	return {
		customer: found,
		stats: {
			orders: orders.length,
			openOrders: orders.filter((o) => isOpenOrder(o.status)).length,
			revenue: prices.reduce((sum, price) => sum + price.total, 0),
			revenueOrders: done.length,
			lastOrderAt: orders[0]?.createdAt ?? null,
		},
	};
});

/** The countries the form offers: those the tenant uses plus the rest of Europe, alphabetically. */
async function knownCountries() {
	const used = await db
		.selectDistinct({ country: customer.country })
		.from(customer)
		.where(inTenant(customer));
	return [...new Set([...europeanCountries, ...used.map((row) => row.country)])].sort((a, b) =>
		a.localeCompare(b),
	);
}

/** The form problem of a country that isn't one of the known ones, if it isn't. */
async function countryProblems(country: string): Promise<Problem<"country">[]> {
	if ((await knownCountries()).includes(country)) return [];
	return [{ field: "country", message: m.customers_country_unknown() }];
}

/** Everything the customer form needs to choose from. */
export const getCustomerFormOptions = query(async () => {
	requireMember();
	return { countries: await knownCountries() };
});

export const createCustomer = form(v.object(customerFields), async (input, issue) => {
	const { organizationId } = requireMember();
	refuse(issue, await countryProblems(input.country));

	const code = await db.transaction(async (tx) => {
		const code = await nextNumber(tx, "customer");
		const [created] = await tx
			.insert(customer)
			.values({ ...input, organizationId, code })
			.returning({ id: customer.id });
		await recordActivity(tx, {
			action: "created",
			subject: { type: "customer", id: created.id, label: code },
		});
		return code;
	});
	void getCustomers().refresh();
	redirect(303, `/customers/${code}`);
});

export const updateCustomer = form(
	v.object({ id: id(), ...customerFields }),
	async ({ id, ...input }, issue) => {
		requireMember();
		const existing = await db.query.customer.findFirst({ where: idInTenant(customer, id) });
		if (!existing) error(404, m.customers_not_found());
		refuse(issue, await countryProblems(input.country));

		await db.transaction(async (tx) => {
			await tx.update(customer).set(input).where(idInTenant(customer, id));
			const subject = { type: "customer", id, label: existing.code };
			await recordActivity(tx, { action: "updated", subject, before: existing, after: input });
		});
		void getCustomers().refresh();
		void getCustomer(existing.code).refresh();
		redirect(303, `/customers/${existing.code}`);
	},
);

/**
 * Deletes one of the tenant's customers; refuses one with equipment or orders (or other records
 * referring to it). A 404 if there's no such customer. The customer's page and the list's bulk
 * delete share it.
 */
async function removeCustomer(id: number) {
	const existing = await db.query.customer.findFirst({
		columns: { id: true, code: true },
		where: idInTenant(customer, id),
	});
	if (!existing) error(404, m.customers_not_found());

	const [[units], [orders]] = await Promise.all([
		db
			.select({ n: count() })
			.from(equipment)
			.where(and(eq(equipment.customerId, id), inTenant(equipment))),
		db
			.select({ n: count() })
			.from(order)
			.where(and(eq(order.customerId, id), inTenant(order))),
	]);
	if (units.n || orders.n) {
		const unitCount = m.customers_count_units({ count: units.n });
		const orderCount = m.common_count_orders({ count: orders.n });
		const references =
			units.n && orders.n
				? m.customers_references_both({ units: unitCount, orders: orderCount })
				: units.n
					? unitCount
					: orderCount;
		invalid(m.customers_delete_refused({ references }));
	}

	await deleteAndLog(
		customer,
		{ type: "customer", id, label: existing.code },
		m.customers_delete_referenced(),
	);
}

export const deleteCustomer = form(v.object({ id: id() }), async ({ id }) => {
	requireMember();
	await removeCustomer(id);
	void getCustomers().refresh();
	redirect(303, "/customers");
});

/** Deletes the selected customers, with the same refusals as deleting one. */
export const bulkDeleteCustomers = command(idsTarget, async (target) => {
	requireMember();
	const result = await bulkChange(target, {
		table: customer,
		label: customer.code,
		change: (each) => removeCustomer(each.id),
	});
	void getCustomers().refresh();
	return result;
});
