import { and, countDistinct, eq } from "drizzle-orm";

import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db, type Runner } from "#lib/server/db/index.ts";
import { defineRemoval } from "#lib/server/records.ts";

import { material, orderLine } from "./schema.ts";

/** How many different orders of the current tenant use a material. */
export const ordersUsing = async (materialId: number, runner: Runner = db) => {
	const [row] = await runner
		.select({ count: countDistinct(orderLine.orderId) })
		.from(orderLine)
		.where(and(eq(orderLine.materialId, materialId), inTenant(orderLine)));
	return row.count;
};

/** A material of the current tenant, by id (ids come from the client, so check the tenant). */
export const findMaterial = (id: number) =>
	db.query.material.findFirst({ where: idInTenant(material, id) });

/**
 * Deletes one of the tenant's materials with its stock history; refuses one that orders use (or
 * other records refer to). A 404 if there's no such material. The material's page and the list's
 * bulk delete share it.
 */
export const removeMaterial = defineRemoval({
	table: material,
	find: (tx, id) =>
		tx.query.material.findFirst({
			columns: { id: true, sku: true },
			where: idInTenant(material, id),
		}),
	notFound: m.materials_not_found,
	subject: (found) => ({ type: "material", id: found.id, label: found.sku }),
	blockers: async (found, tx) => {
		const orders = await ordersUsing(found.id, tx);
		if (orders) return m.materials_delete_in_use({ count: orders });
	},
	referenced: m.materials_delete_referenced,
});
