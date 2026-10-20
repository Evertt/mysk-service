<!--
	@component
	A delete button that asks for confirmation, then submits `form` (a remote form taking the record's
	`id`): `ConfirmDialog` with a destructive button for its trigger. If the server refuses with
	`invalid("…")`, the reason is shown in the dialog.

	The submission doesn't refresh the page's queries (which SvelteKit does by default): `form` says
	what changes itself, refreshing it on the server or redirecting to a page that loads afresh (the
	list), and the record's own queries would only answer that it's gone. Asked again while the page
	is left, they failed in the parts that show their errors, the modules' slots.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ConfirmDialog from "./confirm-dialog.svelte";

	let {
		form,
		id,
		title,
		description,
		label = m.common_delete(),
	}: {
		form: Omit<RemoteForm<{ id: string }, unknown>, "for">;
		id: string;
		title: string;
		description: string;
		label?: string;
	} = $props();
</script>

<ConfirmDialog
	{form}
	hidden={{ id }}
	updates={() => []}
	{title}
	{description}
	confirmLabel={label}
	destructive
>
	{#snippet trigger(props)}
		<Button {...props} variant="destructive">
			<Trash2Icon data-icon="inline-start" />
			{label}
		</Button>
	{/snippet}
</ConfirmDialog>
