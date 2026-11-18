import { and, count, eq } from "drizzle-orm";

import { equipmentSubject } from "#lib/activity/index.ts";
import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { equipment, orderUnit } from "#lib/server/db/schema.ts";
import { defineRemoval } from "#lib/server/records.ts";

import { documentFilesOf } from "./documents.ts";

/**
 * Deletes one of the tenant's units; refuses one that orders (or an optional module's records)
 * refer to. A 404 if there's no such unit. Its documents' rows go with it; their files are deleted
 * once it has committed. The unit's page and the list's bulk delete share it.
 */
export const removeEquipment = defineRemoval({
	table: equipment,
	find: (tx, id) =>
		tx.query.equipment.findFirst({
			columns: { id: true, serialNumber: true },
			where: idInTenant(equipment, id),
		}),
	notFound: m.equipment_not_found,
	subject: equipmentSubject,
	blockers: async ({ id }, tx) => {
		const [{ total }] = await tx
			.select({ total: count() })
			.from(orderUnit)
			.where(and(eq(orderUnit.equipmentId, id), inTenant(orderUnit)));
		if (total) return m.equipment_delete_refused({ count: total });
	},
	afterwards: ({ id }, tx) => documentFilesOf(tx, id),
	referenced: m.equipment_delete_referenced,
});
