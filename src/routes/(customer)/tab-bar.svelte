<!--
	@component
	The customer portal's tab bar, at the foot of the screen as a phone app's: Home, Orders, Scan (in
	the middle, raised, the camera's QR scanner), Equipment and More (the tenant's modules' pages,
	the language and appearance, and signing out). The tab of the page shown is marked: a page under
	a tab (an order, a unit, a location) marks its tab, a module's page marks More. It stays at the
	foot while the page scrolls, above a phone's home indicator (`--safe-area-bottom`).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import BuildingIcon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import EllipsisIcon from "@lucide/svelte/icons/ellipsis";
	import HouseIcon from "@lucide/svelte/icons/house";
	import ScanLineIcon from "@lucide/svelte/icons/scan-line";
	import type { Component } from "svelte";

	const home = resolve("/(customer)/portal");
	const tabs = $derived<
		{ id: string; label: string; href: string; icon: Component; current: boolean }[]
	>([
		{
			id: "home",
			label: m.client_nav_home(),
			href: home,
			icon: HouseIcon,
			current: page.url.pathname === home || page.url.pathname.startsWith(`${home}/report`),
		},
		{
			id: "orders",
			label: m.client_nav_orders(),
			href: resolve("/(customer)/portal/orders"),
			icon: ClipboardListIcon,
			current: page.url.pathname.startsWith(`${home}/orders`),
		},
		{
			id: "scan",
			label: m.common_scan_tab(),
			href: resolve("/(customer)/portal/scan"),
			icon: ScanLineIcon,
			current: page.url.pathname.startsWith(`${home}/scan`),
		},
		{
			id: "equipment",
			label: m.client_tab_equipment(),
			href: resolve("/(customer)/portal/equipment"),
			icon: BuildingIcon,
			current:
				page.url.pathname.startsWith(`${home}/equipment`) ||
				page.url.pathname.startsWith(`${home}/locations`),
		},
		{
			id: "more",
			label: m.client_tab_more(),
			href: resolve("/(customer)/portal/more"),
			icon: EllipsisIcon,
			// Its own page, and the modules' pages, which are outside `/portal`.
			current: page.url.pathname.startsWith(`${home}/more`) || !page.url.pathname.startsWith(home),
		},
	]);
</script>

<nav
	class="tab-bar sticky bottom-0 z-20 border-t bg-card/95 pb-(--safe-area-bottom) backdrop-blur print:hidden"
	aria-label={m.client_nav_label()}
	data-tab-bar
>
	<ul class="grid grid-cols-5">
		{#each tabs as tab (tab.id)}
			<li class="flex">
				<a
					href={tab.href}
					aria-current={tab.current ? "page" : undefined}
					class={[
						"flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-1 pt-1.5 pb-1 text-[0.6875rem] leading-none font-medium outline-none focus-visible:bg-muted",
						tab.current ? "text-primary" : "text-muted-foreground",
					]}
					data-tab={tab.id}
				>
					{#if tab.id === "scan"}
						<!-- The camera, raised over the bar: the app's main way in, a unit's code. -->
						<span
							class="-mt-6 flex size-13 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-card"
						>
							<tab.icon class="size-6" aria-hidden="true" />
						</span>
					{:else}
						<tab.icon class="size-6" aria-hidden="true" strokeWidth={tab.current ? 2.25 : 1.75} />
					{/if}
					<span class="max-w-full truncate">{tab.label}</span>
				</a>
			</li>
		{/each}
	</ul>
</nav>
