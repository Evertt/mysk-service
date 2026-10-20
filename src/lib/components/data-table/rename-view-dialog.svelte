<!--
	@component
	The dialog to rename a saved view (see `saved-views.svelte`).
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { renameView, type TableView } from "./views.remote.ts";

	let { open = $bindable(false), view }: { open?: boolean; view: TableView } = $props();

	const rename = $derived(renameView.for(String(view.id)));
</script>

<FormDialog
	form={rename}
	title={m.common_views_rename_title()}
	hidden={{ id: String(view.id) }}
	done={m.common_views_renamed()}
	bind:open
>
	<TextField field={rename.fields.name} label={m.common_views_name()} value={view.name} />
</FormDialog>
