<!--
	@component
	The app shell (sidebar and header) for everything behind the login.
-->
<script lang="ts">
	import { getCurrentTenant } from "#lib/auth/session.remote.ts";

	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import type { LayoutProps } from "./$types";
	import AppHeader from "./app-header.svelte";
	import AppSidebar from "./app-sidebar.svelte";
	import PageSkeleton from "./page-skeleton.svelte";

	let { children }: LayoutProps = $props();

	// Before any office page loads: sends field engineers who navigate here to their portal.
	await getCurrentTenant();
</script>

<!-- A list page whose table fills the viewport (see `data-table.svelte`) is as high as the screen,
	and scrolls itself only if it can't shrink enough. -->
<Sidebar.Provider class="desktop:has-data-fill-viewport:h-svh">
	<AppSidebar />
	<!-- min-w-0 lets wide tables scroll inside the page instead of widening it. -->
	<Sidebar.Inset class="min-w-0 desktop:has-data-fill-viewport:overflow-y-auto">
		<AppHeader />
		<div class="relative flex min-h-0 flex-1 flex-col gap-6 p-4 md:p-6">
			{@render children()}
			<NavigationSkeleton class="p-4 md:p-6">
				<PageSkeleton />
			</NavigationSkeleton>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>
