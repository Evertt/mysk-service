<!--
	@component
	A `ConfirmDialog` opened from outside, for `confirm-dialog.svelte.spec.ts`. Shows whether the
	parent sees it open.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import type { ComponentProps } from "svelte";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";

	type Props = ComponentProps<typeof ConfirmDialog<RemoteForm<{ id: string }, unknown>>>;

	let props: Props = $props();

	let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open from outside</button>
<p data-testid="open">{open ? "open" : "closed"}</p>

<ConfirmDialog {...props} bind:open>
	<p>The orders stay.</p>
</ConfirmDialog>
