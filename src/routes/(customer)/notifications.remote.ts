/**
 * The customer portal's notifications (`#lib/server/notifications/`): the changes the contact
 * follows of the orders they read (their customer's, at their sites): accepted or rejected, planned
 * or moved, the engineer on the way, resolved, or cancelled. The dot's count is a plain query that
 * the portal's feed of changes has refresh (`refreshOnActivity()` in the bell; one stream per tab).
 */
import { recordId } from "#lib/schema.ts";
import {
	markSeenUpTo,
	notificationsFor,
	notificationTray,
} from "#lib/server/notifications/index.ts";
import { forCustomers } from "#lib/server/remote-functions.ts";

/** The contact's unread notifications (the dot): counted up to a cap, and the newest one's id. */
export const getPortalUnreadNotifications = forCustomers.query(async () =>
	(await notificationsFor("customer")).unread(),
);

/**
 * The bell's tray: the contact's newest notifications, as a contact reads them (by the tenant, with
 * the order's status and planned time only), and how far they had read.
 */
export const getPortalNotifications = forCustomers.query(() => notificationTray("customer"));

/**
 * Marks the contact's notifications read up to entry `upToId`, the newest the tray showed. A 404
 * for another tenant's entry.
 */
export const markPortalNotificationsSeen = forCustomers.command(recordId(), markSeenUpTo);
