import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { lineTotal } from "#lib/models.ts";
import { priceOrders } from "#lib/orders/server/pricing.ts";
import { m } from "#lib/paraglide/messages.js";
import { inTenant, requireMember, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.ts";

/** How many orders the customer page lists; the orders list has them all. */
const RECENT = 10;

/** A customer's latest orders across all their equipment, newest first, and how many they have. */
export const getCustomerActivity = query(v.string(), async (code) => {
	requireMember();
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

	const lines = orders.length
		? await db
				.select({
					orderId: orderLine.orderId,
					quantity: orderLine.quantity,
					unitPrice: orderLine.unitPrice,
				})
				.from(orderLine)
				.where(
					and(
						inArray(
							orderLine.orderId,
							orders.map((row) => row.id),
						),
						inTenant(orderLine),
					),
				)
		: [];

	// Priced like everywhere else, so a covered order costs here what it does on its own page.
	const prices = await priceOrders(
		orders.map((row) => ({
			...row,
			materials: lines
				.filter((line) => line.orderId === row.id)
				.reduce((sum, line) => sum + lineTotal(line.quantity, line.unitPrice), 0),
		})),
	);
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
