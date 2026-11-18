<!--
	@component
	Signs out, back to the login page (`signOut`): a row of a phone app's list (the customer portal's More tab), or with `menuItem` the last item of a dropdown menu (the office's user menu, the engineer
	portal's header menu).

	A plain form submission, not enhanced: the page's queries and live queries belong to the session
	that ends, so the login page loads afresh rather than this page refreshing them signed out (which
	logged errors now and then).
-->
<script lang="ts">
	import LogOutIcon from "@lucide/svelte/icons/log-out";

	import { signOut } from "#lib/auth/session.remote.ts";

	let { menuItem = false }: { menuItem?: boolean } = $props();
</script>

<form method={signOut.method} action={signOut.action}>
	{#if menuItem}
		<DropdownMenu.Group>
			<!-- Keep the menu open while signing out, so the form stays mounted until the browser leaves. -->
			<DropdownMenu.Item onSelect={(event) => event.preventDefault()}>
				{#snippet child({ props })}
					<button {...props} type="submit" class={[props.class, "w-full"]}>
						<LogOutIcon />
						{m.common_sign_out()}
					</button>
				{/snippet}
			</DropdownMenu.Item>
		</DropdownMenu.Group>
	{:else}
		<button
			type="submit"
			class="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left text-[0.9375rem] font-medium text-destructive transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted active:bg-muted"
		>
			<LogOutIcon class="size-5 shrink-0" aria-hidden="true" />
			{m.common_sign_out()}
		</button>
	{/if}
</form>
