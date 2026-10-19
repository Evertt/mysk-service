/**
 * The office shell's own data: the counts its sidebar and header show, and the notifications'
 * tray (`#lib/server/notifications/`). The counts share one live query, so a tab holds one stream
 * for them (an open stream keeps the Durable Object awake, `docs/plans/cloudflare.md`).
 */
import { everyLoggedType } from "#lib/activity/index.ts";
import { awaitingAcceptance } from "#lib/orders/server/index.ts";
import { recordId } from "#lib/schema.ts";
import { currentTenant } from "#lib/server/auth/index.ts";
import { live } from "#lib/server/live.ts";
import {
	markSeenUpTo,
	type Notifications,
	notificationsFor,
	notificationTray,
} from "#lib/server/notifications/index.ts";
import { forMembers } from "#lib/server/remote-functions.ts";

/**
 * The counts in the office's shell, sent again whenever something changes in the tenant (once per
 * burst): the orders customers reported that await acceptance (the badge on the sidebar's Orders),
 * and the signed-in user's unread notifications (the bell's dot), with the newest one's id.
 */
export const watchShell = forMembers.query.live(() => {
	const { organizationId } = currentTenant();
	// Read in the request (the first answer is), for the answers after later changes too.
	let notifications: Promise<Notifications> | undefined;
	return live(everyLoggedType(), async () => {
		notifications ??= notificationsFor("office");
		const [awaiting, unread] = await Promise.all([
			awaitingAcceptance(organizationId),
			notifications.then((each) => each.unread()),
		]);
		return { awaiting, notifications: unread };
	});
});

/** The bell's tray: the signed-in user's newest notifications, and how far they had read. */
export const getNotifications = forMembers.query(() => notificationTray("office"));

/**
 * Marks the signed-in user's notifications read up to entry `upToId`, the newest the tray showed.
 * A 404 for another tenant's entry.
 */
export const markNotificationsSeen = forMembers.command(recordId(), markSeenUpTo);
