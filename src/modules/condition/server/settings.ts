/** The tenant's condition settings: its thresholds, and whether critical units are planned by themselves. */
import { eq } from "drizzle-orm";

import { currentTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import type { Thresholds } from "../model.ts";
import { conditionSettings } from "./schema.ts";

/** The tenant's condition settings, made with the defaults (automatic planning off) when first read. */
export async function settingsOf(organizationId = currentTenant().organizationId) {
	const where = eq(conditionSettings.organizationId, organizationId);
	const found = await db.query.conditionSettings.findFirst({ where });
	if (found) return found;
	await db.insert(conditionSettings).values({ organizationId }).onConflictDoNothing();
	return (await db.query.conditionSettings.findFirst({ where }))!;
}

/** The tenant's thresholds. */
export async function thresholdsOf(organizationId?: string): Promise<Thresholds> {
	const settings = await settingsOf(organizationId);
	return { critical: settings.criticalBelow, attention: settings.attentionBelow };
}
