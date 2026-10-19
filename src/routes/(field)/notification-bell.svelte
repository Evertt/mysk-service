<!--
	@component
	The engineer portal's bell: orders assigned or planned to the engineer, moved, taken off them, or
	cancelled or deleted while theirs. Its dot is a query the portal's live query refreshes
	(`watchMyWork`, which the portal's pages hold already: the same stream), and each entry links to
	its order's page in the portal while the order is theirs.
-->
<script lang="ts">
	import { browser } from "$app/env";
	import { resolve } from "$app/paths";

	import NotificationBell from "#lib/components/notifications/notification-bell.svelte";
	import { refreshOnChange } from "#lib/hooks/refresh-on-change.svelte.ts";

	import { watchMyWork } from "./my/portal.remote.ts";
	import {
		getMyNotifications,
		getMyUnreadNotifications,
		markNotificationsSeen,
	} from "./notifications.remote.ts";

	const unread = getMyUnreadNotifications();
	refreshOnChange(watchMyWork, () => unread.refresh());

	/** The tray, read afresh. */
	async function load() {
		const tray = getMyNotifications();
		await tray.refresh();
		return await tray;
	}
</script>

<NotificationBell
	unread={unread.current}
	{load}
	markSeen={(upToId) => markNotificationsSeen(upToId)}
	empty={m.common_notifications_none_engineer()}
	boundary={() => (browser ? document.querySelector(".field-shell") : null)}
	href={(entry, link) =>
		link.type === "order" && entry.link
			? resolve("/(field)/my/[number]", { number: entry.link })
			: null}
/>
