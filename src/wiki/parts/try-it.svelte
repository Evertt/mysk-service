<!--
	@component
	A button to try what the page shows as one of the SHLTR demo's roles (`as`, named in English:
	`roleNames`): one click signs in as that role's demo user and opens its home, through the login
	page's demo form (`demoSignIn`, which posts only the role's name). Shown only to a visitor who
	isn't signed in to the demo, where its sign-in is switched on (`demoSignInEnabled()`; signed in,
	`getViewAs()` answers, and the user menu's View as switches roles): both answers come with the
	server-rendered page, so nothing flashes in. Nothing where they can't be asked.
-->
<script lang="ts">
	import PlayIcon from "@lucide/svelte/icons/play";

	import type { DemoRole } from "#routes/demo-roles.ts";
	import { demoSignIn, demoSignInEnabled, getViewAs } from "#routes/demo.remote.ts";

	import { roleNames } from "../roles.ts";

	let { as: role }: { as: DemoRole } = $props();

	// One form per role, so a page's buttons each have their own pending state.
	const form = $derived(demoSignIn.for(role));

	/** Whether to offer the sign-in: it's on, and the visitor isn't in the demo already. */
	async function offered() {
		const [enabled, viewAs] = await Promise.all([demoSignInEnabled(), getViewAs()]);
		return enabled && viewAs === null;
	}
</script>

<!-- Without the answers (offline on a client navigation, a hook error) there is no button, not a broken page. -->
<svelte:boundary>
	{#if await offered()}
		<form {...form} class="not-prose my-2">
			<Button
				variant="outline"
				size="sm"
				disabled={!!form.pending}
				{...form.fields.role.as("submit", role)}
			>
				<PlayIcon />
				Try it as the {roleNames[role]}
			</Button>
		</form>
	{/if}
	{#snippet failed()}{/snippet}
</svelte:boundary>
