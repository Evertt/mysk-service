/** The tenant's invoicing settings: the defaults for the invoices it makes. */
import { eq } from "drizzle-orm";

import { requireMember } from "#lib/server/auth";
import { db } from "#lib/server/db/index.ts";

import { invoicingSettings } from "./schema.ts";

/**
 * The tenant's invoicing settings. Made with the defaults the first time they're needed, billing
 * other modules' items from the start of that month.
 */
export async function settingsOf(organizationId = requireMember().organizationId) {
	const where = eq(invoicingSettings.organizationId, organizationId);
	const found = await db.query.invoicingSettings.findFirst({ where });
	if (found) return found;
	const now = new Date();
	await db
		.insert(invoicingSettings)
		.values({ organizationId, billFrom: new Date(now.getFullYear(), now.getMonth(), 1) })
		.onConflictDoNothing();
	return (await db.query.invoicingSettings.findFirst({ where }))!;
}
