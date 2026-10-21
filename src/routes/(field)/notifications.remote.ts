/**
 * The engineer portal's notifications (`#lib/server/notifications/`): the orders assigned or
 * planned to the engineer, moved, taken off them, or cancelled or deleted while theirs. The dot's
 * count is a plain query that the portal's feed of changes has refresh (`refreshOnActivity()` in the
 * bell; one stream per tab).
 */
import { and } from "drizzle-orm";

import { recordId } from "#lib/schema.ts";
import { visibleOrNone } from "#lib/server/access/index.ts";
import { db } from "#lib/server/db/index.ts";
import { inList } from "#lib/server/db/parameters.ts";
import { order } from "#lib/server/db/schema.ts";
import {
	markSeenUpTo,
	notificationsFor,
	notificationTray,
} from "#lib/server/notifications/index.ts";
import { forEngineers } from "#lib/server/remote-functions.ts";

/** The engineer's unread notifications (the dot): counted up to a cap, and the newest one's id. */
export const getMyUnreadNotifications = forEngineers.query(async () =>
	(await notificationsFor("engineer")).unread(),
);

/**
 * The bell's tray: the engineer's newest notifications, and how far they had read. Each links to
 * its order's page in the portal (`link`, its number) while the order is theirs.
 */
export const getMyNotifications = forEngineers.query(async () => {
	const tray = await notificationTray("engineer");
	const ids = [
		...new Set(
			tray.entries.flatMap((entry) =>
				entry.subject.type === "order" ? [Number(entry.subject.target?.id ?? NaN)] : [],
			),
		),
	].filter(Number.isSafeInteger);
	// Only the orders still theirs are linked: what the access registry says they read, in one
	// statement with the numbers (`readable()` would need a second to name them).
	const theirs = ids.length
		? await db
				.select({ id: order.id, number: order.number })
				.from(order)
				.where(and(await visibleOrNone("order"), inList(order.id, ids)))
		: [];
	const numbers = new Map(theirs.map((each) => [String(each.id), each.number]));
	return {
		...tray,
		entries: tray.entries.map((entry) => ({
			...entry,
			link:
				entry.subject.type === "order"
					? (numbers.get(entry.subject.target?.id ?? "") ?? null)
					: null,
		})),
	};
});

/**
 * Marks the engineer's notifications read up to entry `upToId`, the newest the tray showed. A 404
 * for another tenant's entry.
 */
export const markNotificationsSeen = forEngineers.command(recordId(), markSeenUpTo);
