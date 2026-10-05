import { count, desc, eq, sql } from "drizzle-orm";

import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.js";

import type { PageServerLoad } from "./$types";

/** Used to estimate labour cost while no engineer is assigned yet. In cents. */
const STANDARD_HOURLY_RATE = 8500;

export const load: PageServerLoad = async () => {
	const lines = db
		.select({
			orderId: orderLine.orderId,
			count: count().as("line_count"),
			total: sql<number>`sum(${orderLine.quantity} * ${orderLine.unitPrice})`.as("line_total"),
		})
		.from(orderLine)
		.groupBy(orderLine.orderId)
		.as("lines");

	const rows = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			priority: order.priority,
			description: order.description,
			scheduledFor: order.scheduledFor,
			completedAt: order.completedAt,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			customer: { id: customer.id, code: customer.code, name: customer.name },
			equipment: {
				id: equipment.id,
				model: equipment.model,
				manufacturer: equipment.manufacturer,
				serialNumber: equipment.serialNumber,
			},
			engineer: { id: engineer.id, name: engineer.name, hourlyRate: engineer.hourlyRate },
			lineCount: sql<number>`coalesce(${lines.count}, 0)`,
			materialsTotal: sql<number>`coalesce(${lines.total}, 0)`,
		})
		.from(order)
		.innerJoin(customer, eq(order.customerId, customer.id))
		.leftJoin(equipment, eq(order.equipmentId, equipment.id))
		.leftJoin(engineer, eq(order.engineerId, engineer.id))
		.leftJoin(lines, eq(lines.orderId, order.id))
		.orderBy(desc(order.createdAt));

	return {
		orders: rows.map((row) => {
			const laborTotal = Math.round(
				row.laborHours * (row.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE),
			);
			return { ...row, laborTotal, total: row.materialsTotal + laborTotal };
		}),
	};
};
