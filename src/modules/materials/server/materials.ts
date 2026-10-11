import { error, invalid } from "@sveltejs/kit";
import { and, countDistinct, eq } from "drizzle-orm";

import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { deleteAndLog } from "#lib/server/records.ts";

import { material, orderLine } from "./schema.ts";

/** How many different orders of the current tenant use a material. */
export const ordersUsing = async (materialId: number) => {
	const [row] = await db
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
export async function removeMaterial(id: number) {
	const existing = await findMaterial(id);
	if (!existing) error(404, m.materials_not_found());
	const orders = await ordersUsing(id);
	if (orders) {
		invalid(m.materials_delete_in_use({ count: orders }));
	}
	await deleteAndLog(
		material,
		{ type: "material", id, label: existing.sku },
		m.materials_delete_referenced(),
	);
}
