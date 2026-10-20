<!--
	@component
	The dialog to save the table's current view (its URL's parameters and its columns) under a name, for the user
	or, if they may share views, for the whole organization (see `saved-views.svelte`).
-->
<script lang="ts">
	import CheckboxField from "#lib/components/form/checkbox-field.svelte";
	import FormDialog from "#lib/components/form/form-dialog.svelte";
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

<FormDialog
	form={save}
	title={m.common_views_save_title()}
	description={m.common_views_save_description()}
	hidden={{ tableKey, query, columns: JSON.stringify(columns) }}
	reset
	ondone={(result) => onsaved(result?.id)}
	done={m.common_views_saved()}
	bind:open
>
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
</FormDialog>
