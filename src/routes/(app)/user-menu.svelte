<!--
	@component
	The signed-in user in the sidebar footer, with a menu to sign out (and in the SHLTR demo to view
	it as another role, `view-as.svelte`). Signing out is a real form, so it also works without
	JavaScript. The language is in the header, with the theme and the mode (`app-header.svelte`).
-->
<script lang="ts">
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";

	import { getCurrentUser } from "#lib/auth/session.remote.ts";
	import { useSidebar } from "#ui/sidebar";

	import { getViewAs } from "../demo.remote.ts";
	import SignOutButton from "../sign-out-button.svelte";
	import ViewAs from "../view-as.svelte";

	const sidebar = useSidebar();
	// Together, not one after the other.
	const [user, viewAs] = $derived(await Promise.all([getCurrentUser(), getViewAs()]));
	const initials = $derived(
		user.name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0].toUpperCase())
			.join(""),
	);
</script>

{#snippet identity()}
	<Avatar.Root class="size-8 rounded-lg">
		{#if user.image}
			<Avatar.Image src={user.image} alt={user.name} />
		{/if}
		<Avatar.Fallback class="rounded-lg">{initials}</Avatar.Fallback>
	</Avatar.Root>
	<div class="grid flex-1 text-left text-sm leading-tight">
		<span class="truncate font-medium">{user.name}</span>
		<span class="truncate text-xs text-muted-foreground">{user.email}</span>
	</div>
{/snippet}

<Sidebar.Menu>
	<Sidebar.MenuItem>
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Sidebar.MenuButton size="lg" {...props}>
						{@render identity()}
						<ChevronsUpDownIcon class="ml-auto" />
					</Sidebar.MenuButton>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content
				class="w-(--bits-dropdown-menu-anchor-width) min-w-56"
				side={sidebar.isMobile ? "bottom" : "right"}
				align="end"
				sideOffset={4}
			>
				<DropdownMenu.Label class="p-0 font-normal text-popover-foreground">
					<div class="flex items-center gap-2 px-1 py-1.5">
						{@render identity()}
					</div>
				</DropdownMenu.Label>
				<DropdownMenu.Separator />
				{#if viewAs}
					<!-- The SHLTR demo's switch between its roles (with `DEMO_SIGN_IN` only). -->
					<ViewAs current={viewAs.current} inMenu />
					<DropdownMenu.Separator />
				{/if}
				<SignOutButton menuItem />
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
