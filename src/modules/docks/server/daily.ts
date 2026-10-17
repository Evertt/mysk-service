/**
 * The docks module's daily job (`jobs.daily`): the door rules once more (the feed runs them with
 * every batch, but a feed that went quiet leaves an open door unseen), and the events older than
 * `keptDays` pruned: their ids only guard against a batch sent twice, which happens within minutes.
 */
import { and, lt } from "drizzle-orm";

import type { DailyReport, DailyRun } from "#lib/jobs/extensions.ts";
import { inTenant } from "#lib/server/auth/index.ts";
import { db } from "#lib/server/db/index.ts";

import { checkDoors } from "./rules.ts";
import { dockEvent } from "./schema.ts";

/** How long the feed's events are kept. */
const keptDays = 30;

export async function runDocksDaily(_run: DailyRun): Promise<DailyReport> {
	const now = Temporal.Now.instant();
	const checked = await checkDoors(now);
	await db.transaction((tx) =>
		tx
			.delete(dockEvent)
			.where(
				and(inTenant(dockEvent), lt(dockEvent.receivedAt, now.subtract({ hours: keptDays * 24 }))),
			),
	);
	return { "docks.notices": checked.notices, "docks.orders": checked.orders.length };
}
