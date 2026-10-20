<!--
	@component
	The customer portal's navigation, like the office's sidebar: the tenant at the top, then the
	portal's own pages and those of the tenant's modules that have one (see `portal` in
	`#lib/modules/manifests.ts`). On a wide screen it's beside the page and folds to its icons; on a
	phone it's a sheet the header's button opens, which closes again once an entry is chosen.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import BuildingIcon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import HouseIcon from "@lucide/svelte/icons/house";
	import SirenIcon from "@lucide/svelte/icons/siren";
	import type { Component } from "svelte";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import { type AppModule, modulePages, modules } from "#lib/modules/manifests.ts";
	import { useSidebar } from "#ui/sidebar";

	let { organization }: { organization: string } = $props();

	const sidebar = useSidebar();
	const tenantModules = $derived(await getTenantModules());

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
	const portalPages = $derived(
		(modules as readonly AppModule[]).flatMap((module) => {
			const route = modulePages[module.id].portal;
			return route && module.portal && tenantModules.some((id) => id === module.id)
				? [{ id: module.id, route, ...module.portal }]
				: [];
		}),
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
		...portalPages.map((entry) => ({
			id: entry.id,
			label: entry.label(),
			href: resolve(entry.route),
			icon: entry.icon,
			current: isAt(entry.route),
		})),
	]);
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent={organization}>
					{#snippet child({ props })}
						<a {...props} href={resolve("/(customer)/portal")}>
							<span
								class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
							>
								<BuildingIcon class="size-4" />
							</span>
							<span class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">{organization}</span>
								<span class="truncate text-xs text-sidebar-foreground/70">{m.client_title()}</span>
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<nav aria-label={m.client_nav_label()}>
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each nav as entry (entry.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={entry.current} tooltipContent={entry.label}>
									{#snippet child({ props })}
										<a
											{...props}
											href={entry.href}
											aria-current={entry.current ? "page" : undefined}
											onclick={() => sidebar.setOpenMobile(false)}
										>
											<entry.icon />
											<span>{entry.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</nav>
	</Sidebar.Content>
	<Sidebar.Rail />
</Sidebar.Root>
