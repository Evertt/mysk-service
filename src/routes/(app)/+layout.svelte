<!--
	@component
	The app shell (sidebar and header) for everything behind the login.
-->
<script lang="ts">
	import { browser } from "$app/env";
	import { type Component, onMount } from "svelte";

	import { getCurrentTenant } from "#lib/auth/session.remote.ts";
	import { nameOrderTypes } from "#lib/orders/index.ts";
	import { getOrderTypes } from "#lib/orders/remotes.ts";

	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import type { LayoutProps } from "./$types";
	import AppHeader from "./app-header.svelte";
	import AppSidebar from "./app-sidebar.svelte";
	import PageSkeleton from "./page-skeleton.svelte";
	import { loadModuleSkeletons } from "./page-skeleton.ts";
	import { connectSwrWorker } from "./swr-worker.ts";

	let { children }: LayoutProps = $props();

	// The order types read as the tenant named them: in the browser from this query, from before the
	// first await, as the page may render meanwhile; its `current` is reactive, so the labels follow
	// a change. (The server reads the request's tenant, see `nameOrderTypesOnServer()`.)
	const orderTypes = getOrderTypes();
	if (browser) nameOrderTypes(() => orderTypes.current);

	// Before any office page loads: sends field engineers who navigate here to their portal. Read
	// once, not as a `$derived`: a refresh of the tenant must not hold up the shell.
	const [tenant] = await Promise.all([getCurrentTenant(), orderTypes]);
	const moduleIds = tenant.modules;

	// The service worker that answers queries from its cache (see `swr-worker.ts`).
	connectSwrWorker(tenant);

	/**
	 * The skeletons of the tenant's modules' pages, by route id, loaded once the shell has mounted.
	 * A plain `Map`: the overlay is made anew for each navigation, so it reads what's there then.
	 */
	const skeletons = new Map<string, Component>();
	onMount(() => {
		void loadModuleSkeletons(moduleIds).then((loaded) => {
			for (const [routeId, skeleton] of loaded) skeletons.set(routeId, skeleton);
		});
	});
</script>

<!-- A list page whose table fills the viewport (see `data-table.svelte`) is as high as the screen,
	and scrolls itself only if it can't shrink enough. -->
<Sidebar.Provider class="desktop:has-data-fill-viewport:h-svh">
	<AppSidebar />
	<!-- min-w-0 lets wide tables scroll inside the page instead of widening it. -->
	<Sidebar.Inset class="min-w-0 desktop:has-data-fill-viewport:overflow-y-auto">
		<AppHeader />
		<!-- Shrinks to the screen's height, but not below what its table needs at least (a table that
			fills the viewport counts as only its minimum height), so the page scrolls instead and keeps
			its padding under the table. -->
		<div
			class="relative flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6 desktop:has-[[data-slot=data-table][data-fill-viewport]]:min-h-auto"
		>
			{@render children()}
			<NavigationSkeleton group="/(app)" class="p-4 md:p-6">
				{#snippet skeleton(routeId)}
					<PageSkeleton {routeId} {skeletons} />
				{/snippet}
			</NavigationSkeleton>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
