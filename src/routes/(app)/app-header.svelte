<!--
	@component
	The office's header: the sidebar's button, then the sync state, the bell, "Report a problem" and
	the language, theme and mode, together as on the other shells' headers.
-->
<script lang="ts">
	import BugReportButton from "#lib/bug-reports/bug-report-button.svelte";
	import { useTheme } from "#lib/themes/context.ts";
	import { cn } from "#lib/utils.ts";

	import AppearanceSwitchers from "../appearance-switchers.svelte";
	import NotificationBell from "./notification-bell.svelte";
	import SyncIndicator from "./sync-indicator.svelte";

	const theme = useTheme();
</script>

<header
	data-slot="app-header"
	class={cn(
		"flex h-14 shrink-0 items-center gap-2 border-b px-4 print:hidden",
		theme.classes("app-header"),
	)}
>
	<Sidebar.Trigger class="-ml-1" />
	<div class="ml-auto flex items-center gap-1">
		<SyncIndicator />
		<NotificationBell />
		<BugReportButton />
		<AppearanceSwitchers />
	</div>
</header>
