/** The tenant's invoicing settings: the defaults for the invoices it makes. */
import { eq } from "drizzle-orm";

import { getTimeZone } from "#lib/dates.ts";
import { requireMember } from "#lib/server/auth/index.ts";
import { db, type Transaction } from "#lib/server/db/index.ts";

import { invoicingSettings } from "./schema.ts";

/**
 * The tenant's invoicing settings. Made with the defaults the first time they're needed, billing
 * other modules' items from the start of that month. Inside a transaction, pass it as `tx`.
 */
export async function settingsOf(
	organizationId = requireMember().organizationId,
	tx: Transaction | typeof db = db,
) {
	const where = eq(invoicingSettings.organizationId, organizationId);
	const found = await tx.query.invoicingSettings.findFirst({ where });
	if (found) return found;
	await tx
		.insert(invoicingSettings)
		.values({ organizationId, billFrom: Temporal.Now.plainDateISO(getTimeZone()).with({ day: 1 }) })
		.onConflictDoNothing();
	return (await tx.query.invoicingSettings.findFirst({ where }))!;
}
