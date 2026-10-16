import { error } from "@sveltejs/kit";
import { and, count, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { priceOrders } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

/** How many orders the customer page lists; the orders list has them all. */
const RECENT = 10;

/** A customer's latest orders across all their equipment, newest first, and how many they have. */
export const getCustomerActivity = forMembers.query(v.string(), async (code) => {
	const [found] = await db
		.select({ id: customer.id })
		.from(customer)
		.where(and(eq(customer.code, code), inTenant(customer)));
	if (!found) error(404, m.customers_code_not_found({ code }));

	const [[{ total }], orders] = await Promise.all([
		db
			.select({ total: count() })
			.from(order)
			.where(and(eq(order.customerId, found.id), inTenant(order))),
		db
			.select({
				id: order.id,
				number: order.number,
				type: order.type,
				status: order.status,
				scheduledFor: order.scheduledFor,
				completedAt: order.completedAt,
				createdAt: order.createdAt,
				equipmentId: order.equipmentId,
				laborHours: order.laborHours,
				hourlyRate: engineer.hourlyRate,
				equipment: {
					serialNumber: equipment.serialNumber,
					name: equipment.name,
					manufacturer: equipment.manufacturer,
					model: equipment.model,
				},
			})
			.from(order)
			.leftJoin(...tenantJoin(equipment, order.equipmentId))
			.leftJoin(...tenantJoin(engineer, order.engineerId))
			.where(and(eq(order.customerId, found.id), inTenant(order)))
			.orderBy(desc(order.createdAt), desc(order.id))
			.limit(RECENT),
	]);

	// Priced like everywhere else, so a covered order costs here what it does on its own page.
	const prices = await priceOrders(orders);
	return {
		total,
		orders: orders.map(
			({ laborHours: _hours, hourlyRate: _rate, equipmentId: _unit, ...row }, i) => ({
				...row,
				total: prices[i].total,
			}),
		),
	};
});
