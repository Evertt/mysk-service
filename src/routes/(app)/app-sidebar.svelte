<script lang="ts">
	import { resolve } from "$app/paths";
	import { page } from "$app/state";
	import ClipboardListIcon from "@lucide/svelte/icons/clipboard-list";
	import FactoryIcon from "@lucide/svelte/icons/factory";
	import LayoutDashboardIcon from "@lucide/svelte/icons/layout-dashboard";

	const items = [
		{ title: "Dashboard", href: resolve("/(app)"), icon: LayoutDashboardIcon },
		{ title: "Orders", href: resolve("/(app)/orders"), icon: ClipboardListIcon },
	];

	// Sections stay highlighted on their sub-pages, e.g. Orders on an order's detail page.
	const isActive = (href: string) =>
		href === resolve("/(app)")
			? page.url.pathname === href
			: page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
</script>

<Sidebar.Root collapsible="icon">
	<Sidebar.Header>
		<Sidebar.Menu>
			<Sidebar.MenuItem>
				<Sidebar.MenuButton size="lg">
					{#snippet child({ props })}
						<a href={resolve("/(app)")} {...props}>
							<div
								class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
							>
								<FactoryIcon class="size-4" />
							</div>
							<div class="grid flex-1 text-left text-sm leading-tight">
								<span class="truncate font-medium">Fieldworks</span>
								<span class="truncate text-xs text-sidebar-foreground/70">Service operations</span>
							</div>
						</a>
					{/snippet}
				</Sidebar.MenuButton>
			</Sidebar.MenuItem>
		</Sidebar.Menu>
	</Sidebar.Header>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupLabel>Operations</Sidebar.GroupLabel>
			<Sidebar.GroupContent>
				<Sidebar.Menu>
					{#each items as item (item.href)}
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
	</Sidebar.Content>
	<Sidebar.Rail />
</Sidebar.Root>
