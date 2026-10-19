/**
 * Energy's notifications (`notifications.rules`): the office hears of an alert the readings raise
 * by themselves (`evaluate.ts`, as the system, when the feed's batch is stored), a zone or door
 * over its threshold. Making an alert into an order (`alert_ordered`) is someone's own doing, which
 * the core's "changes to my records" covers for whoever handled the alert before.
 */
import { and } from "drizzle-orm";

import type { NotificationRule } from "#lib/notifications/extensions.ts";
import { bySystem, entryAbout } from "#lib/server/notifications/index.ts";

export const energyNotificationRules = (): NotificationRule[] => [
	{
		id: "energy.alerts",
		audience: "office",
		category: "alerts",
		where: () => and(entryAbout("energy_alert", ["created"]), bySystem)!,
	},
];
