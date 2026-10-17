<script lang="ts">
	import { browser } from "$app/env";
	import { beforeNavigate } from "$app/navigation";
	import { navigating, page, updated } from "$app/state";
	import { onMount } from "svelte";
	import { toast } from "svelte-sonner";

	import favicon from "#lib/assets/favicon.svg";
	import ProgressBar from "#lib/components/progress-bar.svelte";
	import ThemeProvider from "#lib/themes/theme-provider.svelte";
	import { getMode, getTheme } from "#lib/themes/theme.remote.ts";

	import type { LayoutProps } from "./$types";
	import AppToaster from "./app-toaster.svelte";
	import { watchActivity, whenIdle } from "./idle.ts";

	import "./layout.css";
	import { takeNewVersion, tookNewVersion } from "./new-version.ts";
	import { dismissSplash } from "./splash.ts";
	import { keepTimeZone } from "./time-zone.ts";

	let { children }: LayoutProps = $props();

	// Marks the page as interactive (hydrated), which the end-to-end tests wait for, and after which
	// components are rendered in the browser (e.g. the data tables read their column widths at once).
	// It also fades out the splash screen of a full page load (`app.html`).
	onMount(() => {
		document.documentElement.dataset.hydrated = "";
		dismissSplash();
		keepTimeZone();
		if (tookNewVersion()) toast.info(m.common_new_version_loaded());
	});

	// Once SvelteKit has noticed a new deployment (`updated`), the next navigation loads the page
	// afresh, so the tab runs the new version (SvelteKit's own pattern, see `version` in its config),
	// and says so once loaded. The browser also checks for a new service worker then.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) takeNewVersion(to.url.href);
	});

	// A tab nobody has touched for an hour takes a new deployment without waiting for a navigation:
	// a reload interrupts nothing then. (SvelteKit also checks for one hourly, and when the tab is
	// shown or focused.)
	const idleFor = 60 * 60 * 1000;
	const lastActive = browser ? watchActivity() : undefined;
	$effect(() => {
		if (updated.current && lastActive) return whenIdle(lastActive, idleFor, () => takeNewVersion());
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
	<!-- The engineer portal shows its own, in its phone (see its layout). -->
	{#if !page.route.id?.startsWith("/(field)/")}
		<AppToaster />
	{/if}
</ThemeProvider>

<style>
	/* A table's own loading bar is enough (a filter, sort or page of a list, see `data-table.svelte`). */
	:global(body:has([data-slot="data-table"][aria-busy="true"]) .navigation-progress) {
		display: none;
	}
</style>
