<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { Path } from "$app/types";

	import favicon from "#lib/assets/favicon.svg";
	import AppHeader from "#lib/components/app-header.svelte";
	import AppSidebar from "#lib/components/app-sidebar.svelte";
	import { locales, localizeHref } from "#lib/paraglide/runtime.js";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getTheme } from "#lib/themes/theme.remote.js";

	import "./layout.css";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeProvider name={await getTheme()}>
	<Sidebar.Provider>
		<AppSidebar />
		<!-- min-w-0 lets wide tables scroll inside the page instead of widening it. -->
		<Sidebar.Inset class="min-w-0">
			<AppHeader />
			<div class="flex flex-1 flex-col gap-6 p-4 md:p-6">
				{@render children()}
			</div>
		</Sidebar.Inset>
	</Sidebar.Provider>
</ThemeProvider>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Path)}>{locale}</a>
	{/each}
</div>
