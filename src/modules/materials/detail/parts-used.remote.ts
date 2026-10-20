/**
 * The parts used on a unit ("Onderdelen"): the materials on the lines of its done orders, whether
 * it's their only unit or one of several, added up per material, the most recently used first. An
 * order's lines don't say which of its units they were for, so an order for several units counts
 * its lines on each of them: with the most units an order of a material had (`units`), the card
 * says they were shared.
 */
import { and, desc, max, sql, sum } from "drizzle-orm";
import * as v from "valibot";

import { unitBySerial } from "#lib/equipment/server/index.ts";
import { doneOrderStatuses } from "#lib/models.ts";
import { onUnit, unitCount } from "#lib/orders/server/index.ts";
import { inTenant, tenantJoin } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";

import { query } from "../remote-functions.ts";
import { material, orderLine } from "../server/schema.ts";

/**
 * The tenant's unit `serialNumber`'s parts, per material: how much, on how many orders, on an order
 * for how many units at most, last when.
 */
export const getPartsUsed = query(v.string(), async (serialNumber) => {
	const unit = await unitBySerial(serialNumber);
	const lastUsed = max(order.completedAt).mapWith(order.completedAt);
	return db
		.select({
			sku: material.sku,
			name: material.name,
			unit: material.unit,
			quantity: sum(orderLine.quantity).mapWith(Number),
			orders: sql<number>`count(distinct ${order.id})`.mapWith(Number),
			units: sql<number>`max(${unitCount()})`.mapWith(Number),
			lastUsed,
		})
		.from(orderLine)
		.innerJoin(...tenantJoin(order, orderLine.orderId))
		.innerJoin(...tenantJoin(material, orderLine.materialId))
		.where(and(inTenant(orderLine), onUnit(unit.id), inList(order.status, [...doneOrderStatuses])))
		.groupBy(material.id)
		.orderBy(desc(lastUsed), material.name);
});
