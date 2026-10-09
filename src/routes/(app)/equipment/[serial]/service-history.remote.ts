import { query } from "$app/server";
import { error } from "@sveltejs/kit";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import * as v from "valibot";

import { lineTotal } from "#lib/models.ts";
import { priceOrders } from "#lib/orders/server/pricing.ts";
import { inTenant, requireMember, tenantJoin } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";
import { engineer, equipment, material, order, orderLine } from "#lib/server/db/schema.ts";

import { buildTimeline, type HistoryOrder, serviceStats } from "./service-history.ts";

/** One of the tenant's units' service history: its timeline (newest first) and key figures. */
export const getServiceHistory = query(v.string(), async (serialNumber) => {
	requireMember();
	const [unit] = await db
		.select({
			id: equipment.id,
			installedAt: equipment.installedAt,
			warrantyUntil: equipment.warrantyUntil,
		})
		.from(equipment)
		.where(and(eq(equipment.serialNumber, serialNumber), inTenant(equipment)));
	if (!unit) error(404, m.equipment_serial_not_found({ serial: serialNumber }));

	const orders = await db
		.select({
			id: order.id,
			number: order.number,
			type: order.type,
			status: order.status,
			description: order.description,
			scheduledFor: order.scheduledFor,
			completedAt: order.completedAt,
			createdAt: order.createdAt,
			laborHours: order.laborHours,
			engineer: { id: engineer.id, name: engineer.name, hourlyRate: engineer.hourlyRate },
		})
		.from(order)
		.leftJoin(...tenantJoin(engineer, order.engineerId))
		.where(and(eq(order.equipmentId, unit.id), inTenant(order)))
		.orderBy(desc(order.createdAt), desc(order.id));

	const lines = orders.length
		? await db
				.select({
					id: orderLine.id,
					orderId: orderLine.orderId,
					quantity: orderLine.quantity,
					unitPrice: orderLine.unitPrice,
					sku: material.sku,
					name: material.name,
					unit: material.unit,
				})
				.from(orderLine)
				.innerJoin(...tenantJoin(material, orderLine.materialId))
				.where(
					and(
						inArray(
							orderLine.orderId,
							orders.map((row) => row.id),
						),
						inTenant(orderLine),
					),
				)
				.orderBy(asc(orderLine.id))
		: [];

	const ownLines = orders.map((row) => lines.filter((line) => line.orderId === row.id));
	// Priced like everywhere else, so a covered order costs here what it does on its own page.
	const prices = await priceOrders(
		orders.map((row, i) => ({
			...row,
			equipmentId: unit.id,
			materials: ownLines[i].reduce(
				(sum, line) => sum + lineTotal(line.quantity, line.unitPrice),
				0,
			),
			hourlyRate: row.engineer?.hourlyRate,
		})),
	);
	const history = orders.map(({ engineer, ...row }, i): HistoryOrder => ({
		...row,
		engineer: engineer && { id: engineer.id, name: engineer.name },
		materials: ownLines[i].map(({ id, sku, name, unit, quantity }) => ({
			id,
			sku,
			name,
			unit,
			quantity,
		})),
		cost: prices[i],
	}));
	const now = new Date();
	return { events: buildTimeline(unit, history, now), stats: serviceStats(history, now) };
});
