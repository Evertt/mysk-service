<!--
	@component
	"View as" in the SHLTR demo (`viewAs` in `demo.remote.ts`): Planner, Engineer and Customer, the
	one signed in marked, each signing in as that role's demo user in place of the current one and
	going to its home. With `inMenu`, a group to put in another dropdown menu (the office's user menu);
	else an icon button with its own menu, for a portal's header. Render it only where `getViewAs()`
	answers (with the demo's flag on, in its organization).

	A plain form submission, not enhanced, like signing out: the page's queries and live queries
	belong to the session that ends, so the new role's home loads afresh rather than this page
	refreshing them as someone else.
-->
<script lang="ts">
	import CheckIcon from "@lucide/svelte/icons/check";
	import UsersRoundIcon from "@lucide/svelte/icons/users-round";

	import { type DemoRole, demoRoleLabels, demoRoles } from "./demo-roles.ts";
	import { viewAs } from "./demo.remote.ts";

	let { current, inMenu = false }: { current: DemoRole | null; inMenu?: boolean } = $props();
</script>

{#snippet choices()}
	<form method={viewAs.method} action={viewAs.action}>
		<DropdownMenu.Group>
			<DropdownMenu.Label>{m.auth_view_as()}</DropdownMenu.Label>
			{#each demoRoles as role (role)}
				{@const selected = role === current}
				<!-- Keep the menu open while switching, so the form stays mounted until the browser
					leaves; the current role only closes it. -->
				<DropdownMenu.Item onSelect={(event) => !selected && event.preventDefault()}>
					{#snippet child({ props })}
						<button
							{...props}
							{...selected ? { type: "button" } : viewAs.fields.role.as("submit", role)}
							role="menuitemradio"
							aria-checked={selected}
							class={[props.class, "w-full pr-8"]}
						>
							{demoRoleLabels[role]()}
							{#if selected}
								<CheckIcon class="absolute right-2" />
							{/if}
						</button>
					{/snippet}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Group>
	</form>
{/snippet}

{#if inMenu}
	{@render choices()}
{:else}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-sm"
					aria-label={current
						? m.auth_view_as_current({ role: demoRoleLabels[current]() })
						: m.auth_view_as()}
				>
					<UsersRoundIcon />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end" class="w-40">
			{@render choices()}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
