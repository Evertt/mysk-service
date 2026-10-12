<!--
	@component
	The dialog to save the table's current view (its URL's parameters and its columns) under a name, for the user
	or, if they may share views, for the whole organization (see `saved-views.svelte`).
-->
<script lang="ts">
	import { toast } from "svelte-sonner";

	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import type { ColumnVisibility } from "./column-visibility.ts";
	import { createView } from "./views.remote.ts";

	let {
		open = $bindable(false),
		tableKey,
		query,
		columns,
		canShare,
		onsaved,
	}: {
		open?: boolean;
		/** The table's key for its views (see `views.ts`). */
		tableKey: string;
		/** What the view saves: the table's parameters as its URL has them. */
		query: string;
		/** And its columns (see `column-visibility.ts`). */
		columns: ColumnVisibility;
		/** Whether the user may share the view with the organization. */
		canShare: boolean;
		/** Called with the id of the view just saved. */
		onsaved: (id: number | undefined) => void;
	} = $props();

	const save = $derived(createView.for(tableKey));
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>{m.common_views_save_title()}</Dialog.Title>
			<Dialog.Description>{m.common_views_save_description()}</Dialog.Description>
		</Dialog.Header>
		<form
			{...save.enhance(async (form) => {
				// Otherwise the fields show what's wrong.
				if (await form.submit()) {
					onsaved(form.result?.id);
					form.element.reset();
					open = false;
					toast.success(m.common_views_saved());
				}
			})}
			class="flex flex-col gap-6"
		>
			<input {...save.fields.tableKey.as("hidden", tableKey)} />
			<input {...save.fields.query.as("hidden", query)} />
			<input {...save.fields.columns.as("hidden", JSON.stringify(columns))} />
			<Field.FieldGroup>
				<TextField
					field={save.fields.name}
					label={m.common_views_name()}
					placeholder={m.common_views_name_placeholder()}
				/>
				{#if canShare}
					<CheckboxField
						field={save.fields.shared}
						label={m.common_views_share_label()}
						description={m.common_views_share_description()}
					/>
				{/if}
			</Field.FieldGroup>
			<Dialog.Footer>
				<Dialog.Close type="button">
					{#snippet child({ props })}
						<Button {...props} variant="outline">{m.common_cancel()}</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" disabled={!!save.pending}>
					{#if save.pending}
						<Spinner data-icon="inline-start" />
					{/if}
					{m.common_save()}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
