<!--
	@component
	Deletes a zone, consumer or door of a site, after asking: an icon button in its row. If the
	server refuses (it holds measurements), the reason is shown in the dialog.
-->
<script lang="ts">
	import type { RemoteForm } from "$app/server";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";

	import ConfirmDialog from "#lib/components/form/confirm-dialog.svelte";

	let {
		form: remote,
		siteId,
		id,
		title,
		description,
		deleted,
	}: {
		form: RemoteForm<{ energySiteId: string; id: string }, unknown>;
		siteId: number;
		id: number;
		/** The question, e.g. "Delete zone Z-A?"; also the button's label. */
		title: string;
		description: string;
		/** The toast once it's gone. */
		deleted: string;
	} = $props();

	const form = $derived(remote.for(String(id)));
</script>

<ConfirmDialog
	{form}
	hidden={{ energySiteId: String(siteId), id: String(id) }}
	{title}
	{description}
	confirmLabel={m.common_delete()}
	destructive
	done={deleted}
>
	{#snippet trigger(props)}
		<Button {...props} variant="ghost" size="icon-sm" aria-label={title}>
			<Trash2Icon />
		</Button>
	{/snippet}
</ConfirmDialog>
