<script lang="ts">
	import { onMount } from "svelte";

	import favicon from "#lib/assets/favicon.svg";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getMode, getTheme } from "#lib/themes/theme.remote.ts";

	import "./layout.css";
	import type { LayoutProps } from "./$types";
	import NavigationProgress from "./navigation-progress.svelte";

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
	<NavigationProgress />
	{@render children()}
	<Toaster
		richColors
		closeButton
		containerAriaLabel={m.common_notifications()}
		closeButtonAriaLabel={m.common_close_notification()}
	/>
</ThemeProvider>
