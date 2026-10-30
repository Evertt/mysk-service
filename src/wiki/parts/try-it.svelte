<!--
	@component
	A button-link to try what the page shows, as one of the SHLTR demo's roles (`as`): to the login
	page, whose demo buttons do the sign-in. Shown only where the demo's sign-in is switched on
	(`demoSignInEnabled()`, as the login page asks it, so the server's answer is in the page and
	nothing flashes in). The one remote function the wiki calls.
-->
<script lang="ts">
	import PlayIcon from "@lucide/svelte/icons/play";

	import { demoRoleLabels, type DemoRole } from "#routes/demo-roles.ts";
	import { demoSignInEnabled } from "#routes/demo.remote.ts";

	let { as: role }: { as: DemoRole } = $props();
</script>

{#if await demoSignInEnabled()}
	<Button href="/login" variant="outline" size="sm" class="not-prose my-2">
		<PlayIcon />
		Try it as the {demoRoleLabels[role]().toLowerCase()}
	</Button>
{/if}
