/**
 * The docks' notifications (`notifications.rules`): the office hears of a door left open too long,
 * as the door rules raise it by themselves (`rules.ts`, as the system): its notice and its
 * escalation. The breakdown order an escalation makes is the core's rule (`orders.automatic`).
 */
import { and } from "drizzle-orm";

import type { NotificationRule } from "#lib/notifications/extensions.ts";
import { bySystem, entryAbout } from "#lib/server/notifications/index.ts";

export const dockNotificationRules = (): NotificationRule[] => [
	{
		id: "docks.doorAlerts",
		audience: "office",
		category: "alerts",
		where: () => and(entryAbout("dock", ["door_alert", "door_escalated"]), bySystem)!,
	},
];
