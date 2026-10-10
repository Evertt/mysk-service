import { error, invalid } from "@sveltejs/kit";
import { and, count, eq } from "drizzle-orm";

import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, order } from "#lib/server/db/schema.ts";
import { deleteAndLog } from "#lib/server/records.ts";

/**
 * Deletes one of the tenant's units; refuses one that orders (or an optional module's records)
 * refer to. A 404 if there's no such unit. The unit's page and the list's bulk delete share it.
 */
export async function removeEquipment(id: number) {
	const existing = await db.query.equipment.findFirst({
		columns: { id: true, serialNumber: true },
		where: idInTenant(equipment, id),
	});
	if (!existing) error(404, m.equipment_not_found());
	const [{ total }] = await db
		.select({ total: count() })
		.from(order)
		.where(and(eq(order.equipmentId, id), inTenant(order)));
	if (total) {
		invalid(m.equipment_delete_refused({ count: total }));
	}
	await deleteAndLog(
		equipment,
		{ type: "equipment", id, label: existing.serialNumber },
		m.equipment_delete_referenced(),
	);
}
