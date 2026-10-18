/**
 * Doors' events over a window, for their openings (`openings()` in `../model.ts`): those in it, and
 * of a door that was open when it starts, the event it opened with, however long ago. Without it an
 * opening older than the window (a dock door open since Friday, on Monday) would be missed: its
 * close, if it's in, dropped as a stray, the door shown closed, its loss and its alert lost. With
 * its own start, the opening keeps its alert's key (one per opening) and its minutes open; what
 * falls in a period is clipped to it (`minutesOpenBetween()`).
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";

import { inTenant } from "#lib/server/auth/index.ts";
import type { db, Transaction } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";

import { energyDoorEvent } from "./schema.ts";

const seconds = (instant: Temporal.Instant) => Math.floor(instant.epochMilliseconds / 1000);

/** The current tenant's events of doors `doorIds` from `from` (up to `to`), as above. */
export async function doorEvents(
	tx: Transaction | typeof db,
	doorIds: number[],
	from: Temporal.Instant,
	to?: Temporal.Instant,
) {
	if (!doorIds.length) return [];
	const { doorId, at, open } = energyDoorEvent;
	const ofDoors = and(inTenant(energyDoorEvent), inList(doorId, doorIds));
	// A door's last close before the window; the first open after it is the opening it's in then.
	// Correlated with the outer event: in a `where` drizzle writes its columns with their table
	// (`"energy_door_event"."door_id"`), which inside the subquery, whose table is `c`, names the
	// outer row. In a select's columns it writes them bare, and they would name `c`'s.
	const closed = sql`(select max(c.at) from energy_door_event c
		where c.organization_id = ${energyDoorEvent.organizationId} and c.door_id = ${doorId}
			and c.open = 0 and c.at < ${seconds(from)})`;
	const [opened, events] = await Promise.all([
		tx
			.select({ doorId, at: sql<Temporal.Instant>`min(${at})`.mapWith(at) })
			.from(energyDoorEvent)
			.where(and(ofDoors, eq(open, true), lt(at, from), sql`${at} > coalesce(${closed}, -1)`))
			.groupBy(doorId)
			.then((rows) => rows.map((row) => ({ ...row, open: true }))),
		tx
			.select({ doorId, at, open })
			.from(energyDoorEvent)
			.where(and(ofDoors, gte(at, from), to ? lt(at, to) : undefined)),
	]);
	return [...opened, ...events];
}
