/**
 * The parts shop's notifications (`notifications.rules`): the office hears of an order a customer
 * placed in the shop (customer reports). Only a customer's contact places one, in the portal
 * (`placeShopOrder()`).
 */
import type { NotificationRule } from "#lib/notifications/extensions.ts";
import { entryAbout } from "#lib/server/notifications/index.ts";

export const shopNotificationRules = (): NotificationRule[] => [
	{
		id: "parts-shop.placed",
		audience: "office",
		category: "reports",
		where: () => entryAbout("shop_order", ["placed"]),
	},
];
