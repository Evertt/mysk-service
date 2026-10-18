import { error, invalid } from "@sveltejs/kit";
import { and, count, eq } from "drizzle-orm";

import { equipmentSubject } from "#lib/activity/index.ts";
import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";
import { equipment, orderUnit } from "#lib/server/db/schema.ts";
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
		.from(orderUnit)
		.where(and(eq(orderUnit.equipmentId, id), inTenant(orderUnit)));
	if (total) {
		invalid(m.equipment_delete_refused({ count: total }));
	}
	await deleteAndLog(
		equipment,
		equipmentSubject({ id, serialNumber: existing.serialNumber }),
		m.equipment_delete_referenced(),
	);
}
