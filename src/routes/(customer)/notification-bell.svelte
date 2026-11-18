<!--
	@component
	The customer portal's bell: the changes the contact follows of the orders they read (accepted or
	rejected, planned or moved, the engineer on the way, resolved, cancelled). Its dot is a query the
	portal's one feed of changes refreshes (`refreshOnActivity()`), and each entry links to its
	order's page in the portal.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import { refreshOnActivity } from "#lib/components/activity/live-activity.svelte.ts";
	import NotificationBell from "#lib/components/notifications/notification-bell.svelte";

	import {
		getPortalNotifications,
		getPortalUnreadNotifications,
		markPortalNotificationsSeen,
	} from "./notifications.remote.ts";

	const unread = getPortalUnreadNotifications();
	// Its notifications are about orders.
	refreshOnActivity(() => unread.refresh(), { types: ["order"] });

	/** The tray, read afresh. */
	async function load() {
		const tray = getPortalNotifications();
		await tray.refresh();
		return await tray;
	}
</script>

<NotificationBell
	unread={unread.current}
	{load}
	markSeen={(upToId) => markPortalNotificationsSeen(upToId)}
	empty={m.common_notifications_none_customer()}
	href={(_entry, link) =>
		link.type === "order" && link.target
			? resolve("/(customer)/portal/orders/[number]", { number: link.target.label })
			: null}
/>
