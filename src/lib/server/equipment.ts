import { error, invalid } from "@sveltejs/kit";
import { and, count, eq } from "drizzle-orm";

import { m } from "#lib/paraglide/messages.js";
import { recordActivity } from "#lib/server/activity.js";
import { refuseIfReferenced } from "#lib/server/db/errors.js";
import { db } from "#lib/server/db/index.js";
import { equipment, order } from "#lib/server/db/schema.js";
import { inTenant } from "#lib/server/session.js";

/**
 * Deletes one of the tenant's units; refuses one that orders (or an optional module's records)
 * refer to. A 404 if there's no such unit. The unit's page and the list's bulk delete share it.
 */
export async function removeEquipment(id: number) {
	const existing = await db.query.equipment.findFirst({
		columns: { id: true, serialNumber: true },
		where: and(eq(equipment.id, id), inTenant(equipment)),
	});
	if (!existing) error(404, m.equipment_not_found());
	const [{ total }] = await db
		.select({ total: count() })
		.from(order)
		.where(and(eq(order.equipmentId, id), inTenant(order)));
	if (total) {
		invalid(m.equipment_delete_refused({ count: total }));
	}
	await refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(equipment).where(and(eq(equipment.id, id), inTenant(equipment)));
				const subject = { type: "equipment", id, label: existing.serialNumber };
				await recordActivity(tx, { action: "deleted", subject });
			}),
		m.equipment_delete_referenced(),
	);
}
