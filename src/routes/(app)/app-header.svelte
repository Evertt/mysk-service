<script lang="ts">
	import BugReportButton from "#lib/bug-reports/bug-report-button.svelte";
	import { useTheme } from "#lib/themes/context.ts";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";
	import { cn } from "#lib/utils.ts";

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
		<ThemeSwitcher />
		<ModeSwitcher />
	</div>
</header>
