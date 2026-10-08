<!--
	@component
	The confirmation to delete a saved view (see `saved-views.svelte`), which does the deleting
	through `onconfirm` while `busy`. (`form/delete-dialog.svelte` is a button with a form of a
	page's record; a view is deleted by a command from the menu.)
-->
<script lang="ts">
	import type { TableView } from "./views.remote.js";

	let {
		open = $bindable(false),
		view,
		busy,
		onconfirm,
	}: {
		open?: boolean;
		view: TableView;
		/** The deletion is under way. */
		busy: boolean;
		onconfirm: () => void;
	} = $props();
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>{m.common_views_delete_title({ name: view.name })}</AlertDialog.Title>
			<AlertDialog.Description>
				{view.shared
					? m.common_views_delete_shared_description()
					: m.common_views_delete_description()}
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>{m.common_cancel()}</AlertDialog.Cancel>
			<Button variant="destructive" disabled={busy} onclick={onconfirm}>
				{#if busy}
					<Spinner data-icon="inline-start" />
				{/if}
				{m.common_delete()}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
