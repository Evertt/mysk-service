<!--
	@component
	Adds a checklist template to the tenant's, or edits one's details: its name, the norm it
	inspects by and how long an inspection by it stays valid. A new one opens on its own page, to
	give it points and categories.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import NumberField from "#lib/components/form/number-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";

	import { defaultValidityMonths, validityLimits } from "../model.ts";
	import { addTemplate, saveTemplate } from "../templates.remote.ts";

	let {
		template,
		open = $bindable(false),
	}: {
		/** The template to edit; a new one if not given. */
		template?: { id: number; name: string; norm: string | null; validityMonths: number };
		open?: boolean;
	} = $props();

	const form = $derived(template ? saveTemplate.for(String(template.id)) : addTemplate);
	const fields = $derived(form.fields);
</script>

<!-- A new one opens on its own page (the server redirects). -->
<FormDialog
	{form}
	title={template ? m.checklists_edit_title({ name: template.name }) : m.checklists_new_title()}
	description={m.checklists_dialog_description()}
	submitLabel={m.checklists_save_template()}
	hidden={template ? { id: String(template.id) } : {}}
	done={m.checklists_template_saved()}
	class="sm:max-w-md"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={fields.name}
			label={m.checklists_field_name()}
			value={template?.name}
			autocomplete="off"
			placeholder={m.checklists_field_name_placeholder()}
		/>
		<TextField
			field={fields.norm}
			label={m.checklists_field_norm()}
			value={template?.norm}
			autocomplete="off"
			placeholder={m.checklists_field_norm_placeholder()}
			description={m.checklists_field_norm_description()}
		/>
		<NumberField
			field={fields.validityMonths}
			label={m.checklists_field_validity_months()}
			value={template?.validityMonths ?? defaultValidityMonths}
			min={validityLimits.min}
			max={validityLimits.max}
			step={1}
			description={m.checklists_field_validity_description()}
		/>
	</Field.FieldGroup>
</FormDialog>
