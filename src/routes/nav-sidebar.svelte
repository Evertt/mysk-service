<!--
	@component
	A shell's navigation in a sidebar (the office's, the customer portal's): its entries in groups,
	the current page's marked (`aria-current="page"`; by `isCurrent`, which is `isCurrentAt()`'s rule
	unless the shell says otherwise). On a wide screen it's beside the page and folds to its icons; on
	a phone it's a sheet the header's button opens, which closes again once an entry is chosen. What's
	above and below the entries is the shell's (`header`, `footer`), and so is what an entry shows
	beside it (`badge`, e.g. the office's count on Orders).
-->
<script lang="ts">
	import { page } from "$app/state";
	import type { Snippet } from "svelte";

	import { isCurrentAt, type NavGroup, type NavItem } from "#lib/modules/nav.ts";
	import { useSidebar } from "#ui/sidebar";

	let {
		groups,
		label,
		isCurrent = (item) => isCurrentAt(page.url.pathname, item),
		header,
		footer,
		badge,
	}: {
		groups: NavGroup[];
		/** The navigation's name, for a screen reader's list of landmarks. */
		label?: string;
		/** Whether `item` is the current page's entry. */
		isCurrent?: (item: NavItem) => boolean;
		/** Above the entries, e.g. the organization. */
		header?: Snippet;
		/** Below the entries, e.g. the user's menu. */
		footer?: Snippet;
		/** What an entry shows beside it, if anything (a `Sidebar.MenuBadge`). */
		badge?: Snippet<[NavItem]>;
	} = $props();

	const sidebar = useSidebar();
</script>

<Sidebar.Root collapsible="icon">
	{#if header}
		<Sidebar.Header>
			{@render header()}
		</Sidebar.Header>
	{/if}
	<Sidebar.Content>
		<nav aria-label={label}>
			{#each groups as group, index (group.label ?? index)}
				<Sidebar.Group>
					{#if group.label}
						<Sidebar.GroupLabel>{group.label}</Sidebar.GroupLabel>
					{/if}
					<Sidebar.GroupContent>
						<Sidebar.Menu>
							{#each group.items as item (item.id)}
								{@const current = isCurrent(item)}
								<Sidebar.MenuItem>
									<Sidebar.MenuButton isActive={current} tooltipContent={item.title}>
										{#snippet child({ props })}
											<a
												{...props}
												href={item.href}
												aria-current={current ? "page" : undefined}
												onclick={() => sidebar.setOpenMobile(false)}
											>
												<item.icon />
												<span>{item.title}</span>
											</a>
										{/snippet}
									</Sidebar.MenuButton>
									{@render badge?.(item)}
								</Sidebar.MenuItem>
							{/each}
						</Sidebar.Menu>
					</Sidebar.GroupContent>
				</Sidebar.Group>
			{/each}
		</nav>
	</Sidebar.Content>
	{#if footer}
		<Sidebar.Footer>
			{@render footer()}
		</Sidebar.Footer>
	{/if}
	<Sidebar.Rail />
</Sidebar.Root>
