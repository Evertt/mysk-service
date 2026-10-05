import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, count, desc, eq, ne, sql } from "drizzle-orm";
import * as v from "valibot";

import { db } from "#lib/server/db/index.js";
import { customer, engineer, equipment, order, orderLine } from "#lib/server/db/schema.js";
import { laborCost, STANDARD_HOURLY_RATE } from "#lib/server/pricing.js";

/** All orders with their customer, equipment, engineer and totals, newest first. */
export const getOrders = query(async () => {
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

	return rows.map((row) => {
		const laborTotal = laborCost(row.laborHours, row.engineer?.hourlyRate);
		return { ...row, laborTotal, total: row.materialsTotal + laborTotal };
	});
});

/** One order with everything on it, plus other orders for the same equipment. */
export const getOrder = query(v.string(), async (number) => {
	const found = await db.query.order.findFirst({
		where: eq(order.number, number),
		with: {
			customer: true,
			equipment: true,
			engineer: true,
			lines: { with: { material: true }, orderBy: (line, { asc }) => asc(line.id) },
		},
	});
	if (!found) error(404, `Order ${number} not found`);

	// Earlier and later work on the same unit, for context.
	const history = found.equipmentId
		? await db.query.order.findMany({
				columns: { id: true, number: true, type: true, status: true, createdAt: true },
				where: and(eq(order.equipmentId, found.equipmentId), ne(order.id, found.id)),
				orderBy: desc(order.createdAt),
				limit: 8,
			})
		: [];

	const lines = found.lines.map((line) => ({ ...line, total: line.quantity * line.unitPrice }));
	const materialsTotal = lines.reduce((sum, line) => sum + line.total, 0);
	const laborTotal = laborCost(found.laborHours, found.engineer?.hourlyRate);

	return {
		order: { ...found, lines },
		totals: {
			materials: materialsTotal,
			laborRate: found.engineer?.hourlyRate ?? STANDARD_HOURLY_RATE,
			labor: laborTotal,
			total: materialsTotal + laborTotal,
		},
		history,
	};
});
