<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import CogIcon from "@lucide/svelte/icons/cog";
	import HardHatIcon from "@lucide/svelte/icons/hard-hat";
	import HistoryIcon from "@lucide/svelte/icons/history";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";

	import { getCurrentTenant } from "#lib/auth/session.remote.ts";
	import { formatNumber } from "#lib/i18n/index.ts";
	import { type AppModule, modulePages, modules } from "#lib/modules/manifests.ts";
	import { type CoreNavId, type NavItem, placeNav } from "#lib/modules/nav.ts";

	import OrganizationSwitcher from "./organization-switcher.svelte";
	import { watchShell } from "./shell.remote.ts";
	import UserMenu from "./user-menu.svelte";

	const tenant = $derived(await getCurrentTenant());
	// The orders customers reported in their portal that wait for a planner, on Orders' badge: the
	// shell's live counts, which the header's bell shares (one stream).
	const shell = watchShell();
	const awaiting = $derived(shell.current?.awaiting);

	/** The core's entries; the tenant's modules are placed among them (`placeNav()`). */
	const coreGroups = $derived([
		{
			label: m.common_nav_operations(),
			items: [
				{
					id: "dashboard",
					title: m.common_nav_dashboard(),
					href: resolve("/(app)/(dashboard)"),
					icon: LayoutDashboardIcon,
				},
				{
					id: "orders",
					title: m.common_nav_orders(),
					href: resolve("/(app)/orders"),
					icon: ClipboardListIcon,
				},
				{
					id: "activity",
					title: m.common_nav_activity(),
					href: resolve("/(app)/activity"),
					icon: HistoryIcon,
				},
			],
		},
		{
			label: m.common_nav_records(),
			items: [
				{
					id: "customers",
					title: m.common_nav_customers(),
					href: resolve("/(app)/customers"),
					icon: Building2Icon,
				},
				{
					id: "equipment",
					title: m.common_nav_equipment(),
					href: resolve("/(app)/equipment"),
					icon: CogIcon,
				},
				{
					id: "engineers",
					title: m.common_nav_engineers(),
					href: resolve("/(app)/engineers"),
					icon: HardHatIcon,
				},
			],
		},
	] satisfies { label: string; items: (NavItem & { id: CoreNavId })[] }[]);

	const groups = $derived(
		placeNav(
			coreGroups,
			// Only the modules the current organization has, with a section of their own.
			modules.flatMap((module) => {
				const home = modulePages[module.id].home;
				if (!home || !tenant.modules.includes(module.id)) return [];
				return [
					{
						id: module.id,
						title: module.label,
						href: resolve(home),
						icon: module.icon,
						after: (module as AppModule).nav?.after,
					},
				];
			}),
			m.common_nav_modules(),
		),
	);

	// Sections stay highlighted on their sub-pages, e.g. Orders on an order's detail page.
	const isActive = (href: string) =>
		href === resolve("/(app)/(dashboard)")
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<OrganizationSwitcher />
	</Sidebar.Header>
	<Sidebar.Content>
		{#each groups as group (group.label)}
			<Sidebar.Group>
				<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each group.items as item (item.href)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(item.href)} tooltipContent={item.title}>
									{#snippet child({ props })}
										<a href={item.href} {...props}>
											<item.icon />
											<span>{item.title}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
								{#if item.id === "orders" && awaiting}
									<Sidebar.MenuBadge
										data-awaiting-acceptance
										title={m.orders_awaiting_badge({ count: formatNumber(awaiting) })}
									>
										{formatNumber(awaiting)}
									</Sidebar.MenuBadge>
								{/if}
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		{/each}
	</Sidebar.Content>
	<Sidebar.Footer>
		<UserMenu />
	</Sidebar.Footer>
	<Sidebar.Rail />
</Sidebar.Root>
