<!--
	@component
	The signed-in user in the sidebar footer, with a menu to choose the language and to sign out.
	Signing out is a real form, so it also works without JavaScript.
-->
<script lang="ts">
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import LanguageSwitcher from "#lib/i18n/language-switcher.svelte";
	import { useSidebar } from "#ui/sidebar";

	import { getCurrentUser, signOut } from "./session.remote.ts";

	const sidebar = useSidebar();
	const user = $derived(await getCurrentUser());
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
				<DropdownMenu.Group>
					<LanguageSwitcher submenu />
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<form {...signOut}>
					<DropdownMenu.Group>
						<!-- Keep the menu open while signing out, so the form stays mounted and shows progress. -->
						<DropdownMenu.Item onSelect={(event) => event.preventDefault()}>
							{#snippet child({ props })}
								<button {...props} type="submit" class={[props.class, "w-full"]}>
									{#if signOut.pending}
										<Spinner />
									{:else}
										<LogOutIcon />
									{/if}
									{m.common_sign_out()}
								</button>
							{/snippet}
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				</form>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
