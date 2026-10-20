import { and, count, eq } from "drizzle-orm";

import { customerSubject } from "#lib/activity/index.ts";
import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { customer, equipment, order } from "#lib/server/db/schema.ts";
import { defineRemoval } from "#lib/server/records.ts";

/**
 * Deletes one of the tenant's customers; refuses one with equipment or orders (or other records
 * referring to it). A 404 if there's no such customer. The customer's page and the list's bulk
 * delete share it.
 */
export const removeCustomer = defineRemoval({
	table: customer,
	find: (tx, id) =>
		tx.query.customer.findFirst({
			columns: { id: true, code: true },
			where: idInTenant(customer, id),
		}),
	notFound: m.customers_not_found,
	subject: customerSubject,
	blockers: async ({ id }, tx) => {
		const [[units], [orders]] = await Promise.all([
			tx
				.select({ n: count() })
				.from(equipment)
				.where(and(eq(equipment.customerId, id), inTenant(equipment))),
			tx
				.select({ n: count() })
				.from(order)
				.where(and(eq(order.customerId, id), inTenant(order))),
		]);
		if (!units.n && !orders.n) return;
		const unitCount = m.customers_count_units({ count: units.n });
		const orderCount = m.common_count_orders({ count: orders.n });
		const references =
			units.n && orders.n
				? m.customers_references_both({ units: unitCount, orders: orderCount })
				: units.n
					? unitCount
					: orderCount;
		return m.customers_delete_refused({ references });
	},
	referenced: m.customers_delete_referenced,
});
