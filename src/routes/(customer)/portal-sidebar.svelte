<!--
	@component
	The customer portal's navigation (`NavSidebar`), like the office's sidebar: the tenant at the top,
	then the portal's own pages and those of the tenant's modules that have one (see `portal` in
	`#lib/modules/manifests.ts`).
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import BuildingIcon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import HouseIcon from "@lucide/svelte/icons/house";
	import SirenIcon from "@lucide/svelte/icons/siren";

	import { getTenantModules } from "#lib/auth/session.remote.ts";
	import { type AppModule, modulePages, modules } from "#lib/modules/manifests.ts";
	import type { NavItem } from "#lib/modules/nav.ts";

	import BrandMark from "../brand-mark.svelte";
	import NavSidebar from "../nav-sidebar.svelte";

	let { organization }: { organization: string } = $props();

	const tenantModules = $derived(await getTenantModules());

	/** The tenant's modules with a page in the portal, in registry order, and their entries. */
	const portalPages = $derived(
		(modules as readonly AppModule[]).flatMap((module) => {
			const route = modulePages[module.id].portal;
			return route && module.portal && tenantModules.some((id) => id === module.id)
				? [{ id: module.id, route, ...module.portal }]
				: [];
		}),
	);

	const items: NavItem[] = $derived([
		{
			id: "home",
			title: m.client_nav_home(),
			href: resolve("/(customer)/portal"),
			icon: HouseIcon,
			exact: true,
		},
		{
			id: "report",
			title: m.client_nav_report(),
			href: resolve("/(customer)/portal/report"),
			icon: SirenIcon,
		},
		{
			id: "orders",
			title: m.client_nav_orders(),
			href: resolve("/(customer)/portal/orders"),
			icon: ClipboardListIcon,
		},
		{
			id: "equipment",
			title: m.client_nav_equipment(),
			href: resolve("/(customer)/portal/equipment"),
			icon: BuildingIcon,
			// A location's page is reached from the equipment's, which lists the locations.
			also: [`${resolve("/(customer)/portal")}/locations`],
		},
		...portalPages.map((entry) => ({
			id: entry.id,
			title: entry.label(),
			href: resolve(entry.route),
			icon: entry.icon,
		})),
	]);
</script>

<NavSidebar groups={[{ items }]} label={m.client_nav_label()}>
	{#snippet header()}
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg" tooltipContent={organization}>
					{#snippet child({ props })}
						<a {...props} href={resolve("/(customer)/portal")}>
							<BrandMark icon={BuildingIcon} sidebar />
							<span class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">{organization}</span>
								<span class="truncate text-xs text-sidebar-foreground/70">{m.client_title()}</span>
							</span>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	{/snippet}
</NavSidebar>
