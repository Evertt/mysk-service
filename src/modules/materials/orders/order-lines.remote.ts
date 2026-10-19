import { and, asc, eq } from "drizzle-orm";

import { recordId } from "#lib/schema.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { query } from "../remote-functions.ts";
import { material, orderLine } from "../server/schema.ts";

/** The materials an order's lines can use, by name, with their list prices. */
export const getMaterialOptions = query(async () => {
	return db
		.select({
			id: material.id,
			sku: material.sku,
			name: material.name,
			unit: material.unit,
			unitPrice: material.unitPrice,
		})
		.from(material)
		.where(inTenant(material))
		.orderBy(asc(material.name));
});

/**
 * One of the tenant's orders' lines, at the prices they were quoted at, as the order form starts
 * from them. None for another tenant's order.
 */
export const getOrderLines = query(recordId(), async (orderId) => {
	return db
		.select({
			id: orderLine.id,
			materialId: orderLine.materialId,
			quantity: orderLine.quantity,
			unitPrice: orderLine.unitPrice,
		})
		.from(orderLine)
		.where(and(eq(orderLine.orderId, orderId), inTenant(orderLine)))
		.orderBy(asc(orderLine.id));
});
