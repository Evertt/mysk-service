/** The tenant's maintenance settings: whether, and how far ahead, plans become orders by themselves. */
import { eq } from "drizzle-orm";

import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { maintenanceSettings } from "./schema.ts";

/** The tenant's maintenance settings, made with the defaults (automatic orders off) when first read. */
export async function settingsOf(organizationId = currentTenant().organizationId) {
	const where = eq(maintenanceSettings.organizationId, organizationId);
	const found = await db.query.maintenanceSettings.findFirst({ where });
	if (found) return found;
	await db.insert(maintenanceSettings).values({ organizationId }).onConflictDoNothing();
	return (await db.query.maintenanceSettings.findFirst({ where }))!;
}
