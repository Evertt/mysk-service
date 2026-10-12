<script lang="ts">
	import { navigating } from "$app/state";
	import { onMount } from "svelte";

	import favicon from "#lib/assets/favicon.svg";
	import ProgressBar from "#lib/components/progress-bar.svelte";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getMode, getTheme } from "#lib/themes/theme.remote.ts";

	import type { LayoutProps } from "./$types";

	import "./layout.css";
	import { keepTimeZone } from "./time-zone.ts";

	let { children }: LayoutProps = $props();

	// Marks the page as interactive (hydrated), which the end-to-end tests wait for, and after which
	// components are rendered in the browser (e.g. the data tables read their column widths at once).
	onMount(() => {
		document.documentElement.dataset.hydrated = "";
		keepTimeZone();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ThemeProvider name={await getTheme()} mode={await getMode()}>
	<!-- While a navigation waits for the next page's data (SvelteKit keeps `navigating` set until its
		remote queries have answered). -->
	<ProgressBar
		active={!!navigating.to}
		label={m.common_navigation_loading()}
		class="navigation-progress fixed inset-x-0 top-0 z-100"
	/>
	{@render children()}
	<Toaster
		richColors
		closeButton
		containerAriaLabel={m.common_notifications()}
		closeButtonAriaLabel={m.common_close_notification()}
	/>
</ThemeProvider>

<style>
	/* A table's own loading bar is enough (a filter, sort or page of a list, see `data-table.svelte`). */
	:global(body:has([data-slot="data-table"][aria-busy="true"]) .navigation-progress) {
		display: none;
	}
</style>
