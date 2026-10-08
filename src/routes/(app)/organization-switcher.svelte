<!--
	@component
	The current organization at the top of the sidebar, with a menu to switch to another one.
-->
<script lang="ts">
	import { resolve } from "$app/paths";
	import CheckIcon from "@lucide/svelte/icons/check";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import FactoryIcon from "@lucide/svelte/icons/factory";
	import SettingsIcon from "@lucide/svelte/icons/settings";

	import { useSidebar } from "#ui/sidebar";

	import { getCurrentTenant, switchOrganization } from "./session.remote.ts";

	const sidebar = useSidebar();
	const tenant = $derived(await getCurrentTenant());
</script>

{#snippet identity()}
	<div
		class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
	>
		<FactoryIcon class="size-4" />
	</div>
	<div class="grid flex-1 text-left text-sm leading-tight">
		<span class="truncate font-medium">{tenant.name}</span>
		<span class="truncate text-xs text-sidebar-foreground/70"
			>{m.common_organization_tagline()}</span
		>
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
				align="start"
				sideOffset={4}
			>
				<DropdownMenu.Group>
					<DropdownMenu.Label>{m.common_organizations()}</DropdownMenu.Label>
					{#each tenant.organizations as organization (organization.id)}
						{@const current = organization.id === tenant.organizationId}
						{@const choose = switchOrganization.for(organization.id)}
						<!-- A plain form submission, not enhanced: everything on the page belongs to the
						     previous organization, so the redirect should load the app afresh. -->
						<form method={choose.method} action={choose.action}>
							<input {...choose.fields.organizationId.as("hidden", organization.id)} />
							<DropdownMenu.Item disabled={current}>
								{#snippet child({ props })}
									<button {...props} type="submit" class={[props.class, "w-full"]}>
										<FactoryIcon />
										<span class="truncate">{organization.name}</span>
										{#if current}
											<CheckIcon class="ml-auto" />
										{/if}
									</button>
								{/snippet}
							</DropdownMenu.Item>
						</form>
					{/each}
				</DropdownMenu.Group>
				<DropdownMenu.Separator />
				<DropdownMenu.Group>
					<DropdownMenu.Item>
						{#snippet child({ props })}
							<a {...props} href={resolve("/(app)/settings")}>
								<SettingsIcon />
								{m.common_organization_settings()}
							</a>
						{/snippet}
					</DropdownMenu.Item>
				</DropdownMenu.Group>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	</Sidebar.MenuItem>
</Sidebar.Menu>
