<!--
	@component
	The office's bell: customer reports, system-raised alerts, progress in the field and changes to
	the user's records. Its dot rides on the shell's live counts (`watchShell`, which the sidebar's
	badge shares), and its tray links to the whole activity log.
-->
<script lang="ts">
	import { resolve } from "$app/paths";

	import NotificationBell from "#lib/components/notifications/notification-bell.svelte";

	import { getNotifications, markNotificationsSeen, watchShell } from "./shell.remote.ts";

	const shell = watchShell();

	/** The tray, read afresh. */
	async function load() {
		const tray = getNotifications();
		await tray.refresh();
		return await tray;
	}
</script>

<NotificationBell
	unread={shell.current?.notifications}
	{load}
	markSeen={(upToId) => markNotificationsSeen(upToId)}
	empty={m.common_notifications_none_office()}
	allHref={resolve("/(app)/activity")}
/>
