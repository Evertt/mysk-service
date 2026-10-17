<!--
	@component
	The customer portal's shell: a slim header with the customer and who's signed in, and the
	portal's navigation (its own pages, then those of the tenant's modules that have one, see
	`portal` in `#lib/modules/manifests.ts`), over one column: made for a phone, fine on a desk.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import BuildingIcon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import HouseIcon from "@lucide/svelte/icons/house";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import SirenIcon from "@lucide/svelte/icons/siren";
	import type { Component } from "svelte";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import { type AppModule, modules } from "#lib/modules/manifests.ts";
	import ModeSwitcher from "#lib/themes/mode-switcher.svelte";
	import { cn } from "#lib/utils.ts";

	import NavigationSkeleton from "../navigation-skeleton.svelte";
	import type { LayoutProps } from "./$types";
	import { getPortalMe, signOut } from "./portal/client.remote.ts";

	let { children }: LayoutProps = $props();

	// Together, not one after the other.
	const [me, tenantModules] = $derived(await Promise.all([getPortalMe(), getTenantModules()]));

	interface NavEntry {
		id: string;
		label: string;
		href: string;
		icon: Component;
		/** Whether it's the current page's entry. */
		current: boolean;
	}

	/** Whether the current page is `route`, or (unless `exact`) a page under it. */
	const isAt = (route: string, exact = false) =>
		exact ? page.route.id === route : (page.route.id?.startsWith(route) ?? false);

	/** The tenant's modules with a page in the portal, in registry order, and their entries. */
	const modulePages = $derived(
		(modules as readonly AppModule[]).flatMap((module) =>
			module.portal && tenantModules.some((id) => id === module.id)
				? [{ id: module.id, ...module.portal }]
				: [],
		),
	);

	const nav: NavEntry[] = $derived([
		{
			id: "home",
			label: m.client_nav_home(),
			href: resolve("/(customer)/portal"),
			icon: HouseIcon,
			current: isAt("/(customer)/portal", true),
		},
		{
			id: "report",
			label: m.client_nav_report(),
			href: resolve("/(customer)/portal/report"),
			icon: SirenIcon,
			current: isAt("/(customer)/portal/report"),
		},
		{
			id: "orders",
			label: m.client_nav_orders(),
			href: resolve("/(customer)/portal/orders"),
			icon: ClipboardListIcon,
			current: isAt("/(customer)/portal/orders"),
		},
		{
			id: "equipment",
			label: m.client_nav_equipment(),
			href: resolve("/(customer)/portal/equipment"),
			icon: BuildingIcon,
			current: isAt("/(customer)/portal/equipment") || isAt("/(customer)/portal/locations"),
		},
		...modulePages.map((entry) => ({
			id: entry.id,
			label: entry.label(),
			// A page without parameters, which the manifest's `RouteId` can't say.
			href: resolve(entry.route as "/(customer)/portal"),
			icon: entry.icon,
			current: isAt(entry.route),
		})),
	]);
</script>

<div class="flex min-h-svh flex-col bg-background" data-customer-portal>
	<header class="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
		<div class="mx-auto flex h-14 w-full max-w-3xl items-center gap-2 px-4">
			<a href={resolve("/(customer)/portal")} class="flex min-w-0 items-center gap-2">
				<span
					class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
				>
					<BuildingIcon class="size-4" />
				</span>
				<span class="flex min-w-0 flex-col leading-tight">
					<span class="truncate text-sm font-medium">{me.customer}</span>
					<span class="truncate text-xs text-muted-foreground">
						{m.client_signed_in_as({ name: me.name, organization: me.organization })}
					</span>
				</span>
			</a>
			<div class="ml-auto flex items-center gap-1">
				<LanguageSwitcher />
				<ModeSwitcher />
				<form {...signOut}>
					<Button type="submit" variant="ghost" size="icon-sm" aria-label={m.common_sign_out()}>
						<LogOutIcon />
					</Button>
				</form>
			</div>
		</div>
		<nav aria-label={m.client_nav_label()} class="mx-auto w-full max-w-3xl overflow-x-auto px-2">
			<ul class="flex gap-1 pb-2">
				{#each nav as entry (entry.id)}
					<li>
						<a
							href={entry.href}
							aria-current={entry.current ? "page" : undefined}
							class={cn(
								"flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
								entry.current && "bg-accent font-medium text-accent-foreground",
							)}
						>
							<entry.icon class="size-4" />
							{entry.label}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</header>
	<main class="relative mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 pb-12">
		{@render children()}
		<NavigationSkeleton group="/(customer)" class="flex flex-col gap-4 p-4">
			{#snippet skeleton()}
				<Skeleton class="h-8 w-48" />
				<Skeleton class="h-32" />
				<Skeleton class="h-32" />
			{/snippet}
		</NavigationSkeleton>
	</main>
</div>
