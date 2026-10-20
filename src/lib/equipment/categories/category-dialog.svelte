<!--
	@component
	Adds an equipment category to the tenant's, or edits one: its name, and the specialty of the
	engineers who service its equipment.
-->
<script lang="ts">
	import FormDialog from "#lib/components/form/form-dialog.svelte";
	import SelectField from "#lib/components/form/select-field.svelte";
	import TextField from "#lib/components/form/text-field.svelte";
	import { labelOptions } from "#lib/i18n/index.ts";
	import { type EngineerSpecialty, engineerSpecialties } from "#lib/models.ts";

	import { addEquipmentCategory, updateEquipmentCategory } from "./categories.remote.ts";

	let {
		category,
		open = $bindable(false),
	}: {
		/** The category to edit; a new one if not given. */
		category?: { id: number; name: string; specialty: EngineerSpecialty | null };
		open?: boolean;
	} = $props();

	const form = $derived(
		category ? updateEquipmentCategory.for(String(category.id)) : addEquipmentCategory,
	);
	const fields = $derived(form.fields);
</script>

<FormDialog
	{form}
	title={category
		? m.equipment_category_edit_title({ name: category.name })
		: m.equipment_category_new_title()}
	description={m.equipment_category_dialog_description()}
	submitLabel={m.equipment_category_save()}
	hidden={category ? { id: String(category.id) } : {}}
	reset={!category}
	done={m.equipment_category_saved()}
	class="sm:max-w-md"
	bind:open
>
	<Field.FieldGroup>
		<TextField
			field={fields.name}
			label={m.equipment_category_field_name()}
			value={category?.name}
			autocomplete="off"
			description={m.equipment_category_field_name_description()}
		/>
		<SelectField
			field={fields.specialty}
			label={m.equipment_category_field_specialty()}
			placeholder={m.equipment_category_no_specialty()}
			value={category?.specialty}
			options={labelOptions("engineerSpecialty", engineerSpecialties)}
			description={m.equipment_category_field_specialty_description()}
		/>
	</Field.FieldGroup>
</FormDialog>
