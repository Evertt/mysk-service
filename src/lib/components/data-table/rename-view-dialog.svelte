<!--
	@component
	The dialog to rename a saved view (see `saved-views.svelte`).
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import TextField from "#lib/components/form/text-field.svelte";

	import { renameView, type TableView } from "./views.remote.js";

	let { open = $bindable(false), view }: { open?: boolean; view: TableView } = $props();

	const rename = $derived(renameView.for(String(view.id)));
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.common_views_rename_title()}</Dialog.Title>
		</Dialog.Header>
		<form
			{...rename.enhance(async (form) => {
				if (await form.submit()) {
					open = false;
					toast.success(m.common_views_renamed());
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...rename.fields.id.as("hidden", String(view.id))} />
			<Field.FieldGroup>
				<TextField field={rename.fields.name} label={m.common_views_name()} value={view.name} />
			</Field.FieldGroup>
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="outline">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={!!rename.pending}>
					{#if rename.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.common_save()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
