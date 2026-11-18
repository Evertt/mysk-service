import { and, desc } from "drizzle-orm";
import * as v from "valibot";

import { onUnit, priceOrders, withUnitIds } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { engineer, equipment, order } from "#lib/server/db/schema.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

import { unitBySerial } from "../server/lookup.ts";
import { type HistoryOrder, serviceStats } from "./service-history.ts";

/**
 * One of the tenant's units' service history in figures: its orders (newest first, priced) and
 * the key figures they make. What happened to it, step by step, is its timeline
 * (`../timeline/`).
 */
export const getServiceHistory = forMembers.query(v.string(), async (serialNumber) => {
	const unit = await unitBySerial(serialNumber, { id: equipment.id });

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
		// Its orders, whether it's their only unit or one of several.
		.where(and(onUnit(unit.id), inTenant(order)))
		.orderBy(desc(order.createdAt), desc(order.id));

	// Priced like everywhere else, so a covered order costs here what it does on its own page.
	const facts = await withUnitIds(orders);
	const prices = await priceOrders(
		facts.map((row) => ({ ...row, hourlyRate: row.engineer?.hourlyRate })),
	);
	const history = facts.map(({ engineer, equipmentIds, ...row }, i): HistoryOrder => ({
		...row,
		engineer: engineer && { id: engineer.id, name: engineer.name },
		units: equipmentIds.length,
		cost: prices[i],
	}));
	return { orders: history, stats: serviceStats(history, Temporal.Now.instant()) };
});
