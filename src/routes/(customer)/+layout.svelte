<!--
	@component
	The customer portal's shell, like the office's: the portal's navigation in a sidebar (see
	`portal-sidebar.svelte`), a header with the customer and who's signed in, and the page, which uses
	the width of a desk's screen. On a phone the sidebar is a sheet the header's button opens.
-->
<script lang="ts">
	import { browser } from "$app/env";
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import { nameOrderTypes } from "#lib/orders/index.ts";
	import { getOrderTypes } from "#lib/orders/remotes.ts";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";

	import { getViewAs } from "../demo.remote.ts";
	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import ViewAs from "../view-as.svelte";
	import type { LayoutProps } from "./$types";
	import PortalSidebar from "./portal-sidebar.svelte";
	import { getPortalMe, signOut } from "./portal/client.remote.ts";

	let { children }: LayoutProps = $props();

	// The order types read as the tenant named them: in the browser from this query, from before the
	// first await, as the page may render meanwhile; its `current` is reactive, so the labels follow
	// a change. (The server reads the request's tenant, see `nameOrderTypesOnServer()`.)
	const orderTypes = getOrderTypes();
	if (browser) nameOrderTypes(() => orderTypes.current);

	// Together, not one after the other.
	const [me, , viewAs] = $derived(await Promise.all([getPortalMe(), orderTypes, getViewAs()]));
</script>

<Sidebar.Provider data-customer-portal>
	<PortalSidebar organization={me.organization} />
	<!-- min-w-0 lets wide tables scroll inside the page instead of widening it. -->
	<Sidebar.Inset class="min-w-0">
		<header
			data-slot="portal-header"
			class="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur"
		>
			<Sidebar.Trigger class="-ml-1" />
			<Separator orientation="vertical" class="mr-1 h-4! self-center" />
			<span class="flex min-w-0 flex-col leading-tight">
				<span class="truncate text-sm font-medium">{me.customer}</span>
				<span class="truncate text-xs text-muted-foreground">
					{m.client_signed_in_as({ name: me.name, organization: me.organization })}
				</span>
			</span>
			<div class="ml-auto flex shrink-0 items-center gap-1">
				<LanguageSwitcher />
				<ModeSwitcher />
				{#if viewAs}
					<ViewAs current={viewAs.current} />
				{/if}
				<!-- A plain form submission, not enhanced: the page's queries and live queries belong to
					the session that ends, so the login page loads afresh rather than this page refreshing
					them signed out (which logged errors). -->
				<form method={signOut.method} action={signOut.action}>
					<Button type="submit" variant="ghost" size="icon-sm" aria-label={m.common_sign_out()}>
						<LogOutIcon />
					</Button>
				</form>
			</div>
		</header>
		<div
			class="relative mx-auto flex w-full max-w-[1400px] min-w-0 flex-1 flex-col gap-6 p-4 pb-12 md:p-6"
		>
			{@render children()}
			<NavigationSkeleton group="/(customer)" class="flex flex-col gap-4 p-4 md:p-6">
				{#snippet skeleton()}
					<Skeleton class="h-8 w-48" />
					<div class="grid gap-4 lg:grid-cols-3">
						<Skeleton class="h-40 lg:col-span-2" />
						<Skeleton class="h-40" />
					</div>
					<Skeleton class="h-64" />
				{/snippet}
			</NavigationSkeleton>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

<style>
	/* On paper only the page: no navigation, no header (e.g. a work order to print). */
	@media print {
		:global([data-customer-portal] [data-slot="sidebar"]),
		:global([data-customer-portal] [data-slot="portal-header"]) {
			display: none !important;
		}
	}
</style>
