<script lang="ts">
	import { page } from "$app/state";
	import { onMount } from "svelte";

	import favicon from "#lib/assets/favicon.svg";
	import { locales, localizeHref } from "#lib/paraglide/runtime.js";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getMode, getTheme } from "#lib/themes/theme.remote.js";

	import "./layout.css";
	import type { LayoutProps } from "./$types";

	let { children }: LayoutProps = $props();

	// Marks the page as interactive (hydrated), which the end-to-end tests wait for.
	onMount(() => {
		document.documentElement.dataset.hydrated = "";
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeProvider name={await getTheme()} mode={await getMode()}>
	{@render children()}
	<Toaster richColors closeButton />
</ThemeProvider>

<div style="display:none">
	{#each locales as locale (locale)}
		<!-- Lets crawlers and prerendering find every language's version of the page. -->
		<a href={localizeHref(page.url.pathname, { locale })}>{locale}</a>
	{/each}
</div>
