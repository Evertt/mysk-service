<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { Path } from "$app/types";

	import favicon from "#lib/assets/favicon.svg";
	import AppSidebar from "#lib/components/app-sidebar.svelte";
	import ThemeSwitcher from "#lib/components/theme-switcher.svelte";
	import { locales, localizeHref } from "#lib/paraglide/runtime.js";

	import "./layout.css";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Sidebar.Provider>
	<AppSidebar />
	<!-- min-w-0 lets wide tables scroll inside the page instead of widening it. -->
	<Sidebar.Inset class="min-w-0">
		<header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
			<Sidebar.Trigger class="-ml-1" />
			<div class="ml-auto">
				<ThemeSwitcher />
			</div>
		</header>
		<div class="flex flex-1 flex-col gap-6 p-4 md:p-6">
			{@render children()}
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Path)}>{locale}</a>
	{/each}
</div>
