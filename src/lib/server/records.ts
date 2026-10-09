import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import { recordActivity, type Subject } from "./activity/log.ts";
import { refuseIfReferenced } from "./db/errors.ts";
import { db } from "./db/index.ts";
import { idInTenant, type TenantTable } from "./session.ts";

/**
 * Deletes one of the tenant's records and logs it (`"deleted"`), in one transaction. Refuses with
 * `referenced` if rows (also of optional modules) still refer to it. The checks before it differ
 * per section (counts of orders, a material in use), so they stay in the section's `removeX()`;
 * each section also keeps its own message, e.g. `m.customers_delete_referenced()`.
 *
 * Deleting is the one change that always looks the same. An update varies (`ignore`, a `note`, a
 * check in between) and spells out which fields are compared, so it's written out where it's made.
 */
export function deleteAndLog(
	table: SQLiteTable & TenantTable,
	subject: Subject & { id: number },
	referenced: string,
) {
	return refuseIfReferenced(
		() =>
			db.transaction(async (tx) => {
				await tx.delete(table).where(idInTenant(table, subject.id));
				await recordActivity(tx, { action: "deleted", subject });
			}),
		referenced,
	);
}
