/** The programme at a glance, for the dashboard's card: partners per level, and credit to spend. */
import { currentDay } from "#lib/dates.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { levelFor, sortedTiers } from "./model.ts";
import { query } from "./remote-functions.ts";
import { partnerJoins } from "./server/list-sql.ts";
import { rulesFor } from "./server/rules.ts";
import { partnerAccount } from "./server/schema.ts";
import { outstandingCredit } from "./server/wallet.ts";

/**
 * This year's partners by the level their Partner Omzet reaches so far (the highest first, then
 * those below the first level), and the wallets' credit that can still be spent.
 */
export const getProgrammeOverview = query(async () => {
	const now = currentDay();
	const rules = await rulesFor(now.year);
	const joins = partnerJoins(rules, now);
	const partners = await joins
		.join(db.select({ revenue: joins.revenue }).from(partnerAccount).$dynamic())
		.where(inTenant(partnerAccount));
	const tiers = sortedTiers(rules?.tiers ?? []);
	const counts = new Map<string | null, number>();
	for (const { revenue } of partners) {
		const level = levelFor(tiers, revenue)?.level ?? null;
		counts.set(level, (counts.get(level) ?? 0) + 1);
	}
	return {
		year: now.year,
		partners: partners.length,
		levels: [
			...tiers
				.toReversed()
				.map((tier) => ({ level: tier.level, count: counts.get(tier.level) ?? 0 })),
			{ level: null, count: counts.get(null) ?? 0 },
		],
		credit: await outstandingCredit(now),
	};
});
