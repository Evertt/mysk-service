<!--
	@component
	The developers' pages (`/ops/…`, `forDevelopers`): no tenant's shell, as a developer isn't
	necessarily a member of the organization whose report they read. A plain header and a wide column.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import BugIcon from "@lucide/svelte/icons/bug";

	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";

	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<div class="flex min-h-svh flex-col bg-background">
	<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
		<a href={resolve("/(ops)/ops/bug-reports")} class="flex items-center gap-2 font-medium">
			<span
				class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
			>
				<BugIcon class="size-4" />
			</span>
			{m.common_app_name()}
		</a>
		<div class="ml-auto flex items-center gap-1">
			<ModeSwitcher />
		</div>
	</header>
	<main class="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6">
		{@render children()}
	</main>
</div>
