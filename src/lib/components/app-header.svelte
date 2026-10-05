<script lang="ts">
	import { useTheme } from "#lib/themes/context.js";
	import ThemeSwitcher from "#lib/themes/theme-switcher.svelte";
	import { cn } from "#lib/utils.js";

	const theme = useTheme();
</script>

<header
	data-slot="app-header"
	class={cn("flex h-14 shrink-0 items-center gap-2 border-b px-4", theme.classes("app-header"))}
>
	<Sidebar.Trigger class="-ml-1" />
	<div class="ml-auto">
		<ThemeSwitcher />
	</div>
</header>
