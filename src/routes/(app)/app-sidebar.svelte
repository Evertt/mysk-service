<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import Building2Icon from "@lucide/svelte/icons/building-2";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import CogIcon from "@lucide/svelte/icons/cog";
	import HardHatIcon from "@lucide/svelte/icons/hard-hat";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";
	import PackageIcon from "@lucide/svelte/icons/package";

	import { modules } from "#lib/modules.js";

	import OrganizationSwitcher from "./organization-switcher.svelte";
	import { getCurrentTenant } from "./session.remote.js";
	import UserMenu from "./user-menu.svelte";

	const tenant = $derived(await getCurrentTenant());

	const groups = $derived(
		[
			{
				label: "Operations",
				items: [
					{ title: "Dashboard", href: resolve("/(app)"), icon: LayoutDashboardIcon },
					{ title: "Orders", href: resolve("/(app)/orders"), icon: ClipboardListIcon },
				],
			},
			{
				label: "Records",
				items: [
					{ title: "Customers", href: resolve("/(app)/customers"), icon: Building2Icon },
					{ title: "Equipment", href: resolve("/(app)/equipment"), icon: CogIcon },
					{ title: "Engineers", href: resolve("/(app)/engineers"), icon: HardHatIcon },
					{ title: "Materials", href: resolve("/(app)/materials"), icon: PackageIcon },
				],
			},
			{
				label: "Modules",
				// Only the modules the current organization has.
				items: modules
					.filter((module) => tenant.modules.includes(module.id))
					.map((module) => ({
						title: module.label,
						href: resolve(module.route),
						icon: module.icon,
					})),
			},
		].filter((group) => group.items.length),
	);

	// Sections stay highlighted on their sub-pages, e.g. Orders on an order's detail page.
	const isActive = (href: string) =>
		href === resolve("/(app)")
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
