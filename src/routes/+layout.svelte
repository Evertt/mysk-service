<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import type { Path } from "$app/types";

	import favicon from "#lib/assets/favicon.svg";
	import { locales, localizeHref } from "#lib/paraglide/runtime.js";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getMode, getTheme } from "#lib/themes/theme.remote.js";

	import "./layout.css";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeProvider name={await getTheme()} mode={await getMode()}>
	{@render children()}
</ThemeProvider>

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Path)}>{locale}</a>
	{/each}
</div>
