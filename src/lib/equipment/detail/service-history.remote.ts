import { error } from "@sveltejs/kit";
import { and, desc, eq } from "drizzle-orm";
import * as v from "valibot";

import { priceOrders } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { engineer, equipment, order } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { buildTimeline, type HistoryOrder, serviceStats } from "./service-history.ts";

/** One of the tenant's units' service history: its timeline (newest first) and key figures. */
export const getServiceHistory = forMembers.query(v.string(), async (serialNumber) => {
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

	// Priced like everywhere else, so a covered order costs here what it does on its own page, with
	// what each cost is made of (e.g. the materials used).
	const prices = await priceOrders(
		orders.map((row) => ({ ...row, equipmentId: unit.id, hourlyRate: row.engineer?.hourlyRate })),
		{ items: true },
	);
	const history = orders.map(({ engineer, ...row }, i): HistoryOrder => ({
		...row,
		engineer: engineer && { id: engineer.id, name: engineer.name },
		cost: prices[i],
	}));
	const now = Temporal.Now.instant();
	return { events: buildTimeline(unit, history, now), stats: serviceStats(history, now) };
});
