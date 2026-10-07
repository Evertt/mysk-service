<!--
	@component
	The app shell (sidebar and header) for everything behind the login.
-->
<script lang="ts">
	import type { LayoutProps } from "./$types";
	import AppHeader from "./app-header.svelte";
	import AppSidebar from "./app-sidebar.svelte";
	import { getCurrentTenant } from "./session.remote.js";

	let { children }: LayoutProps = $props();

	// Before any office page loads: sends field engineers who navigate here to their portal.
	await getCurrentTenant();
</script>

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
