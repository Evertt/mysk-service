import { and, count, eq } from "drizzle-orm";

import { idInTenant, inTenant } from "#lib/server/auth/index.ts";
import { engineer, order } from "#lib/server/db/schema.ts";
import { defineRemoval } from "#lib/server/records.ts";

/**
 * Deletes one of the tenant's engineers; refuses one with orders assigned (or other records
 * referring to it). A 404 if there's no such engineer.
 */
export const removeEngineer = defineRemoval({
	table: engineer,
	find: (tx, id) =>
		tx.query.engineer.findFirst({
			columns: { id: true, name: true },
			where: idInTenant(engineer, id),
		}),
	notFound: m.engineers_not_found,
	subject: (found) => ({ type: "engineer", id: found.id, label: found.name }),
	blockers: async (found, tx) => {
		const [{ assigned }] = await tx
			.select({ assigned: count() })
			.from(order)
			.where(and(inTenant(order), eq(order.engineerId, found.id)));
		if (assigned > 0) return m.engineers_delete_refused({ name: found.name, count: assigned });
	},
	referenced: m.engineers_delete_referenced,
});
