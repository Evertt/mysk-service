<!--
	@component
	Renames one of a unit's documents, and says what kind it is (`editDocument`).
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import { equipmentDocumentKinds } from "#lib/models.ts";

	import { editDocument } from "./documents.remote.ts";
	import type { UnitDocument } from "./documents.ts";

	let {
		document,
		open = $bindable(false),
	}: {
		/** The document to edit; none while the dialog is closed. */
		document: Pick<UnitDocument, "id" | "title" | "kind"> | null;
		open?: boolean;
	} = $props();

	const form = $derived(editDocument.for(String(document?.id ?? "none")));
	const kinds = $derived(labelOptions("equipmentDocumentKind", equipmentDocumentKinds));
</script>

<FormDialog
	{form}
	title={m.equipment_documents_edit_title()}
	description={m.equipment_documents_edit_description()}
	hidden={{ id: document ? String(document.id) : undefined }}
	done={m.equipment_documents_saved()}
	class="sm:max-w-lg"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={form.fields.title}
			label={m.equipment_documents_field_title()}
			value={document?.title}
			autocomplete="off"
		/>
		<SelectField
			field={form.fields.kind}
			label={m.equipment_documents_field_kind()}
			options={kinds}
			value={document?.kind}
		/>
	</Field.FieldGroup>
</FormDialog>
